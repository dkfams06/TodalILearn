import type { SupabaseClient } from '@supabase/supabase-js'
import {
  E5_DIMENSIONS,
  E5_EMBEDDING_VERSION,
  E5_MODEL_ID,
  E5_MODEL_REVISION,
  embedQueries,
} from '@/lib/embeddings/e5'

import { analyzeSearchQuery, flattenSearchableValue } from './query'
import {
  exactReferenceMatch,
  matchedTerms,
  normalizeSemanticScore,
  roundedScore,
  termCoverage,
} from './ranking'
import type {
  HybridSearchResponse,
  KnowledgeSearchResult,
  SearchSignals,
  SopSearchResult,
} from './types'

type SourceRow = {
  id: string
  title: string | null
  relative_path: string
}

type ResourceRow = {
  id: string
  source_id: string
  main_topic: string | null
  sub_topics: unknown
  main_bible_texts: unknown
  supporting_bible_texts: unknown
  biblical_people: unknown
  biblical_events: unknown
  core_message: string | null
  summary: string | null
  key_claims: unknown
  illustrations: unknown
  applications: unknown
}

type ChunkRow = {
  id: string
  source_id: string
  resource_id: string | null
  chunk_index: number
  section_name: string
  content: string
  content_start_offset: number
  content_end_offset: number
}

type SemanticKnowledgeRow = ChunkRow & {
  chunk_id: string
  title: string
  relative_path: string
  similarity: number
}

type SopCandidateRow = {
  id: string
  book: string
  chapter: number
  title: string
  chunk_index: number
  content: string
  similarity?: number
  lexical_matches?: number
}

function resourceSearchText(resource: ResourceRow | undefined) {
  if (!resource) return ''
  return flattenSearchableValue({
    main_topic: resource.main_topic,
    sub_topics: resource.sub_topics,
    main_bible_texts: resource.main_bible_texts,
    supporting_bible_texts: resource.supporting_bible_texts,
    biblical_people: resource.biblical_people,
    biblical_events: resource.biblical_events,
    core_message: resource.core_message,
    summary: resource.summary,
    key_claims: resource.key_claims,
    illustrations: resource.illustrations,
    applications: resource.applications,
  })
}

function knowledgeReasons(signals: SearchSignals) {
  const reasons: string[] = []
  if (signals.exactReferenceScore > 0) reasons.push('성경 본문 일치')
  if (signals.titleScore >= 0.34) reasons.push('문서 제목 일치')
  if (signals.metadataScore >= 0.2) reasons.push('주제·인물·사건 메타데이터 일치')
  if (signals.lexicalScore >= 0.2) reasons.push('원문 핵심어 일치')
  if (signals.semanticScore >= 0.75) reasons.push('질의 의미와 유사')
  return reasons.length > 0 ? reasons : ['의미 검색 후보']
}

function buildKnowledgeResults({
  sources,
  resources,
  chunks,
  semanticRows,
  terms,
  bibleReferences,
}: {
  sources: SourceRow[]
  resources: ResourceRow[]
  chunks: ChunkRow[]
  semanticRows: SemanticKnowledgeRow[]
  terms: string[]
  bibleReferences: ReturnType<typeof analyzeSearchQuery>['bibleReferences']
}) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const resourceBySourceId = new Map(resources.map((resource) => [resource.source_id, resource]))
  const semanticByChunkId = new Map(
    semanticRows.map((row) => [row.chunk_id, Number(row.similarity)]),
  )
  const bestBySource = new Map<string, KnowledgeSearchResult & { chunkIndex: number }>()

  for (const chunk of chunks) {
    const source = sourceById.get(chunk.source_id)
    if (!source) continue
    const resource = resourceBySourceId.get(chunk.source_id)
    const metadataText = resourceSearchText(resource)
    const reference = exactReferenceMatch(bibleReferences, metadataText)
    const titleScore = termCoverage(source.title ?? source.relative_path, terms)
    const lexicalScore = termCoverage(`${chunk.section_name} ${chunk.content}`, terms)
    const metadataScore = termCoverage(metadataText, terms)
    const semanticScore = semanticByChunkId.get(chunk.id) ?? 0
    const finalScore =
      reference.score * 4 +
      titleScore * 1.5 +
      lexicalScore * 1.2 +
      metadataScore * 1.7 +
      normalizeSemanticScore(semanticScore)
    const signals: SearchSignals = {
      exactReferenceScore: roundedScore(reference.score),
      titleScore: roundedScore(titleScore),
      lexicalScore: roundedScore(lexicalScore),
      metadataScore: roundedScore(metadataScore),
      semanticScore: roundedScore(semanticScore),
      finalScore: roundedScore(finalScore),
    }
    const result: KnowledgeSearchResult & { chunkIndex: number } = {
      sourceType: 'obsidian',
      sourceId: source.id,
      resourceId: chunk.resource_id,
      chunkId: chunk.id,
      title: source.title ?? source.relative_path,
      relativePath: source.relative_path,
      sectionName: chunk.section_name,
      content: chunk.content,
      contentStartOffset: chunk.content_start_offset,
      contentEndOffset: chunk.content_end_offset,
      matchedTerms: [...new Set([
        ...matchedTerms(`${source.title ?? ''} ${chunk.section_name} ${chunk.content}`, terms),
        ...matchedTerms(metadataText, terms),
      ])],
      matchedReferences: reference.references,
      reasons: knowledgeReasons(signals),
      signals,
      chunkIndex: chunk.chunk_index,
    }
    const current = bestBySource.get(source.id)
    if (
      !current ||
      result.signals.finalScore > current.signals.finalScore ||
      (
        result.signals.finalScore === current.signals.finalScore &&
        result.chunkIndex < current.chunkIndex
      )
    ) bestBySource.set(source.id, result)
  }

  return [...bestBySource.values()]
    .filter((result) => result.signals.finalScore > 0)
    .sort((left, right) =>
      right.signals.finalScore - left.signals.finalScore ||
      right.signals.exactReferenceScore - left.signals.exactReferenceScore ||
      right.signals.metadataScore - left.signals.metadataScore ||
      right.signals.semanticScore - left.signals.semanticScore ||
      left.title.localeCompare(right.title, 'ko'))
    .slice(0, 7)
    .map(({ chunkIndex, ...result }) => {
      void chunkIndex
      return result
    })
}

function buildSopResults({
  semanticRows,
  lexicalRows,
  terms,
}: {
  semanticRows: SopCandidateRow[]
  lexicalRows: SopCandidateRow[]
  terms: string[]
}) {
  const candidates = new Map<string, SopCandidateRow>()
  for (const row of [...semanticRows, ...lexicalRows]) {
    const current = candidates.get(row.id)
    candidates.set(row.id, {
      ...current,
      ...row,
      similarity: row.similarity ?? current?.similarity,
      lexical_matches: row.lexical_matches ?? current?.lexical_matches,
    })
  }

  return [...candidates.values()].map((row): SopSearchResult => {
    const haystack = `${row.book} ${row.title} ${row.content}`
    const lexicalScore = termCoverage(haystack, terms)
    const titleScore = termCoverage(`${row.book} ${row.title}`, terms)
    const semanticScore = Number(row.similarity ?? 0)
    const finalScore = lexicalScore * 1.5 + titleScore * 0.7 + normalizeSemanticScore(semanticScore)
    const signals: SearchSignals = {
      exactReferenceScore: 0,
      titleScore: roundedScore(titleScore),
      lexicalScore: roundedScore(lexicalScore),
      metadataScore: 0,
      semanticScore: roundedScore(semanticScore),
      finalScore: roundedScore(finalScore),
    }
    const reasons: string[] = []
    if (titleScore >= 0.2) reasons.push('책·제목 핵심어 일치')
    if (lexicalScore >= 0.2) reasons.push('원문 핵심어 일치')
    if (semanticScore >= 0.75) reasons.push('질의 의미와 유사')
    return {
      sourceType: 'sop',
      chunkId: row.id,
      book: row.book,
      chapter: row.chapter,
      title: row.title,
      chunkIndex: row.chunk_index,
      content: row.content,
      matchedTerms: matchedTerms(haystack, terms),
      reasons: reasons.length > 0 ? reasons : ['의미 검색 후보'],
      signals,
    }
  })
    .filter((result) => result.signals.finalScore > 0)
    .sort((left, right) =>
      right.signals.finalScore - left.signals.finalScore ||
      right.signals.lexicalScore - left.signals.lexicalScore ||
      right.signals.semanticScore - left.signals.semanticScore ||
      left.chunkId.localeCompare(right.chunkId))
    .slice(0, 5)
}

export async function hybridSearch({
  database,
  userId,
  query,
}: {
  database: SupabaseClient
  userId: string
  query: string
}): Promise<HybridSearchResponse> {
  const startedAt = performance.now()
  const analysis = analyzeSearchQuery(query)
  const [vectors, sourcesResponse] = await Promise.all([
    embedQueries([analysis.originalQuery]),
    database
      .from('obsidian_sources')
      .select('id,title,relative_path')
      .eq('user_id', userId)
      .eq('source_deleted', false),
  ])
  if (sourcesResponse.error) throw sourcesResponse.error
  const sources = (sourcesResponse.data ?? []) as SourceRow[]
  const sourceIds = sources.map((source) => source.id)
  if (sourceIds.length === 0) {
    return {
      analysis,
      knowledgeResults: [],
      sopResults: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      embedding: {
        model: E5_MODEL_ID,
        revision: E5_MODEL_REVISION,
        version: E5_EMBEDDING_VERSION,
        dimensions: E5_DIMENSIONS,
      },
    }
  }

  const queryEmbedding = vectors[0]
  const [resourcesResponse, chunksResponse, knowledgeSemantic, sopSemantic, sopLexical] =
    await Promise.all([
      database
        .from('knowledge_resources')
        .select('id,source_id,main_topic,sub_topics,main_bible_texts,supporting_bible_texts,biblical_people,biblical_events,core_message,summary,key_claims,illustrations,applications')
        .in('source_id', sourceIds),
      database
        .from('knowledge_chunks')
        .select('id,source_id,resource_id,chunk_index,section_name,content,content_start_offset,content_end_offset')
        .in('source_id', sourceIds)
        .eq('embedding_version', E5_EMBEDDING_VERSION),
      database.rpc('match_knowledge_chunks', {
        query_embedding: queryEmbedding,
        requested_user_id: userId,
        match_threshold: -1,
        match_count: 100,
        requested_embedding_version: E5_EMBEDDING_VERSION,
      }),
      database.rpc('match_sop_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: -1,
        match_count: 50,
        requested_embedding_version: E5_EMBEDDING_VERSION,
      }),
      analysis.terms.length > 0
        ? database.rpc('search_sop_chunks_text', {
            query_terms: analysis.terms,
            match_count: 50,
          })
        : Promise.resolve({ data: [], error: null }),
    ])

  for (const response of [
    resourcesResponse,
    chunksResponse,
    knowledgeSemantic,
    sopSemantic,
    sopLexical,
  ]) {
    if (response.error) throw response.error
  }

  return {
    analysis,
    knowledgeResults: buildKnowledgeResults({
      sources,
      resources: (resourcesResponse.data ?? []) as ResourceRow[],
      chunks: (chunksResponse.data ?? []) as ChunkRow[],
      semanticRows: (knowledgeSemantic.data ?? []) as SemanticKnowledgeRow[],
      terms: analysis.terms,
      bibleReferences: analysis.bibleReferences,
    }),
    sopResults: buildSopResults({
      semanticRows: (sopSemantic.data ?? []) as SopCandidateRow[],
      lexicalRows: (sopLexical.data ?? []) as SopCandidateRow[],
      terms: analysis.terms,
    }),
    elapsedMs: Math.round(performance.now() - startedAt),
    embedding: {
      model: E5_MODEL_ID,
      revision: E5_MODEL_REVISION,
      version: E5_EMBEDDING_VERSION,
      dimensions: E5_DIMENSIONS,
    },
  }
}
