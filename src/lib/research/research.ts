import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchBiblePassages, type BibleFetch } from '@/lib/bible/getbible'
import { parseBibleReferences, type ParsedBibleReference } from '@/lib/search/bible-reference'
import { hybridSearch } from '@/lib/search/hybrid'

import {
  RESEARCH_PROMPT_VERSION,
  synthesizeResearch,
  type SynthesisSourceCandidate,
} from './synthesis'
import type { ResearchBundle, ResearchKnowledgeSource, ResearchSopSource } from './types'

type ResourceReferenceRow = {
  id: string
  content_type: string | null
  main_topic: string | null
  core_message: string | null
  summary: string | null
  main_bible_texts: unknown
  supporting_bible_texts: unknown
}

type ResourceReferences = {
  main: ParsedBibleReference[]
  supporting: ParsedBibleReference[]
  contentType: string
  mainTopic: string
  coreMessage: string
  summary: string
}

function stringValues(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

async function loadResourceReferences(database: SupabaseClient, resourceIds: string[]) {
  if (resourceIds.length === 0) return new Map<string, ResourceReferences>()
  const response = await database
    .from('knowledge_resources')
    .select('id,content_type,main_topic,core_message,summary,main_bible_texts,supporting_bible_texts')
    .in('id', resourceIds)
  if (response.error) throw response.error

  return new Map((response.data as ResourceReferenceRow[] | null ?? []).map((resource) => {
    return [resource.id, {
      main: stringValues(resource.main_bible_texts).flatMap(parseBibleReferences),
      supporting: stringValues(resource.supporting_bible_texts).flatMap(parseBibleReferences),
      contentType: resource.content_type ?? '',
      mainTopic: resource.main_topic ?? '',
      coreMessage: resource.core_message ?? '',
      summary: resource.summary ?? '',
    }]
  }))
}

type LinkedBibleReference = {
  reference: ParsedBibleReference
  sourceIds: string[]
}

function collectBibleCandidates({
  explicitReferences,
  resources,
  referencesByResource,
}: {
  explicitReferences: ParsedBibleReference[]
  resources: Array<{ resourceId: string; sourceId: string }>
  referencesByResource: Map<string, ResourceReferences>
}) {
  const linked = new Map<string, LinkedBibleReference>()
  function add(reference: ParsedBibleReference, sourceId?: string) {
    if (reference.verseStart === null) return
    const current = linked.get(reference.normalized)
    if (current) {
      if (sourceId && !current.sourceIds.includes(sourceId)) current.sourceIds.push(sourceId)
      return
    }
    if (linked.size >= 14) return
    linked.set(reference.normalized, { reference, sourceIds: sourceId ? [sourceId] : [] })
  }

  for (const reference of explicitReferences) add(reference)
  for (const chapterReference of explicitReferences.filter((reference) => reference.verseStart === null)) {
    for (const resource of resources) {
      const references = referencesByResource.get(resource.resourceId)
      for (const candidate of [...(references?.main ?? []), ...(references?.supporting ?? [])]) {
        if (candidate.book === chapterReference.book && candidate.chapter === chapterReference.chapter) {
          add(candidate, resource.sourceId)
        }
      }
    }
  }
  for (let index = 0; linked.size < 14; index += 1) {
    let found = false
    for (const resource of resources) {
      const reference = referencesByResource.get(resource.resourceId)?.main[index]
      if (!reference) continue
      found = true
      add(reference, resource.sourceId)
    }
    if (!found) break
  }
  for (const resource of resources) {
    const supporting = referencesByResource.get(resource.resourceId)?.supporting ?? []
    const firstVerse = supporting.find((reference) => reference.verseStart !== null)
    if (firstVerse) add(firstVerse, resource.sourceId)
  }
  for (let index = 1; linked.size < 14; index += 1) {
    let added = false
    for (const resource of resources) {
      const reference = referencesByResource.get(resource.resourceId)?.supporting[index]
      if (!reference) continue
      const before = linked.size
      add(reference, resource.sourceId)
      if (linked.size > before) added = true
    }
    if (!added) break
  }
  return [...linked.values()]
}

function truncate(value: string, maximum: number) {
  const trimmed = value.trim()
  return trimmed.length <= maximum ? trimmed : `${trimmed.slice(0, maximum).trimEnd()}…`
}

export function classifyResearchInput(query: string, references: ParsedBibleReference[]) {
  if (references.length > 0) return 'bible_reference' as const
  if (/(사회|국가|정치|역사|대한민국|공산|차별|법안|시민|섬기)/.test(query)) return 'social' as const
  if (/(관계|연인|함께|사랑|대화|결정|갈등)/.test(query)) return 'relationship' as const
  return 'theme' as const
}

function requestedIds(
  availableIds: string[],
  selectedIds: string[] | undefined,
  field: string,
) {
  if (selectedIds === undefined) return availableIds
  const unique = [...new Set(selectedIds)]
  const available = new Set(availableIds)
  if (unique.some((id) => !available.has(id))) {
    throw new Error(`${field}에 현재 검색 후보가 아닌 자료가 있습니다.`)
  }
  return unique
}

function selectionReason({
  id,
  selected,
  overridden,
  modelReasons,
  searchReasons,
}: {
  id: string
  selected: boolean
  overridden: boolean
  modelReasons: Map<string, string>
  searchReasons: string[]
}) {
  if (selected) {
    return modelReasons.get(id) ?? (overridden
      ? '사용자가 이번 연구 구성에 포함한 자료입니다.'
      : '핵심 메시지와 직접 연결되는 연구 자료입니다.')
  }
  return overridden
    ? '사용자가 이번 연구 구성에서 제외한 자료입니다.'
    : `검색 후보였지만 연구 연결에는 선택되지 않았습니다. (${searchReasons.join(', ')})`
}

export async function createResearchBundle({
  database,
  userId,
  model,
  query,
  personalContext = '',
  selectedKnowledgeIds,
  selectedSopIds,
  fetcher,
}: {
  database: SupabaseClient
  userId: string
  model: string
  query: string
  personalContext?: string
  selectedKnowledgeIds?: string[]
  selectedSopIds?: string[]
  fetcher?: BibleFetch
}): Promise<ResearchBundle> {
  const startedAt = performance.now()
  const search = await hybridSearch({ database, userId, query })
  const knowledgeCandidates = search.knowledgeResults.map((result, index) => ({
    ...result,
    id: `K${index + 1}`,
  }))
  const sopCandidates = search.sopResults.map((result, index) => ({
    ...result,
    id: `S${index + 1}`,
  }))
  const resourceIds = [...new Set(knowledgeCandidates
    .map((candidate) => candidate.resourceId)
    .filter((id): id is string => Boolean(id)))]
  const referencesByResource = await loadResourceReferences(database, resourceIds)
  const linkedBibleReferences = collectBibleCandidates({
    explicitReferences: search.analysis.bibleReferences,
    resources: knowledgeCandidates.flatMap((candidate) => candidate.resourceId
      ? [{ resourceId: candidate.resourceId, sourceId: candidate.id }]
      : []),
    referencesByResource,
  })
  if (linkedBibleReferences.length === 0) {
    throw new Error('절 범위가 있는 성경 본문 후보를 찾지 못했습니다. 질문에 장과 절을 함께 입력해 주세요.')
  }
  const passages = await fetchBiblePassages(
    linkedBibleReferences.map((candidate) => candidate.reference),
    fetcher,
  )
  const bibleCandidates = passages.map((passage, index) => ({
    id: `B${index + 1}`,
    reference: passage.reference,
    text: passage.verses.map((verse) => `${passage.book} ${passage.chapter}:${verse.verse} ${verse.text}`).join('\n'),
    linkedSourceIds: linkedBibleReferences[index].sourceIds,
  }))

  const selectionOverride = selectedKnowledgeIds !== undefined || selectedSopIds !== undefined
  const inputType = classifyResearchInput(query, search.analysis.bibleReferences)
  const knowledgeIds = requestedIds(
    knowledgeCandidates.map((candidate) => candidate.id),
    selectionOverride ? selectedKnowledgeIds ?? [] : undefined,
    'selectedKnowledgeIds',
  )
  const sopIds = requestedIds(
    sopCandidates.map((candidate) => candidate.id),
    selectionOverride ? selectedSopIds ?? [] : undefined,
    'selectedSopIds',
  )
  const chosenKnowledge = new Set(knowledgeIds)
  const chosenSop = new Set(sopIds)
  const allSourceCandidates: SynthesisSourceCandidate[] = [
    ...knowledgeCandidates
      .filter((candidate) => chosenKnowledge.has(candidate.id))
      .map((candidate) => {
        const metadata = candidate.resourceId ? referencesByResource.get(candidate.resourceId) : undefined
        return {
          id: candidate.id,
          type: 'obsidian' as const,
          title: candidate.title,
          locator: `${candidate.relativePath} @ ${candidate.contentStartOffset}-${candidate.contentEndOffset}`,
          reasons: candidate.reasons,
          excerpt: truncate([
            metadata?.contentType ? `[자료 유형] ${metadata.contentType}` : '',
            metadata?.mainTopic ? `[문서 주제] ${metadata.mainTopic}` : '',
            metadata?.coreMessage ? `[문서 핵심] ${metadata.coreMessage}` : '',
            metadata?.summary ? `[검증된 문서 요약] ${metadata.summary}` : '',
            `[검색된 원문]\n${candidate.content}`,
          ].filter(Boolean).join('\n'), 6_000),
        }
      }),
    ...sopCandidates
      .filter((candidate) => chosenSop.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        type: 'sop' as const,
        title: candidate.title,
        locator: `${candidate.book} ${candidate.chapter}장 chunk ${candidate.chunkIndex}`,
        reasons: candidate.reasons,
        excerpt: truncate(candidate.content, 2_500),
      })),
  ]
  const forcedSourceIds = selectionOverride ? allSourceCandidates.map((candidate) => candidate.id) : undefined
  const { synthesis, usage } = await synthesizeResearch({
    model,
    query: search.analysis.originalQuery,
    inputType,
    personalContext,
    bibleCandidates,
    sourceCandidates: allSourceCandidates,
    forcedSourceIds,
  })
  const selectedSourceIds = selectionOverride
    ? new Set(forcedSourceIds)
    : new Set(synthesis.sourceSelections.keys())
  const selectedBibleIds = [synthesis.mainBibleId, ...synthesis.relatedBibleIds]
  const passageById = new Map(passages.map((passage, index) => [`B${index + 1}`, passage]))

  const knowledgeSources: ResearchKnowledgeSource[] = knowledgeCandidates.map((candidate) => {
    const selected = selectedSourceIds.has(candidate.id)
    return {
      id: candidate.id,
      chunkId: candidate.chunkId,
      selected,
      selectionReason: selectionReason({
        id: candidate.id,
        selected,
        overridden: selectionOverride,
        modelReasons: synthesis.sourceSelections,
        searchReasons: candidate.reasons,
      }),
      title: candidate.title,
      relativePath: candidate.relativePath,
      sectionName: candidate.sectionName,
      contentStartOffset: candidate.contentStartOffset,
      contentEndOffset: candidate.contentEndOffset,
      excerpt: candidate.content,
    }
  })
  const sopSources: ResearchSopSource[] = sopCandidates.map((candidate) => {
    const selected = selectedSourceIds.has(candidate.id)
    return {
      id: candidate.id,
      chunkId: candidate.chunkId,
      selected,
      selectionReason: selectionReason({
        id: candidate.id,
        selected,
        overridden: selectionOverride,
        modelReasons: synthesis.sourceSelections,
        searchReasons: candidate.reasons,
      }),
      book: candidate.book,
      chapter: candidate.chapter,
      title: candidate.title,
      chunkIndex: candidate.chunkIndex,
      excerpt: candidate.content,
    }
  })

  return {
    query: search.analysis.originalQuery,
    inputType,
    personalContext,
    coreMessage: synthesis.coreMessage,
    biblePassages: selectedBibleIds.map((id, index) => {
      const passage = passageById.get(id)
      if (!passage) throw new Error(`선택된 성경 본문 ${id}를 찾지 못했습니다.`)
      return { ...passage, id, role: index === 0 ? 'main' as const : 'related' as const }
    }),
    bibleFlow: synthesis.bibleFlow,
    connections: synthesis.connections,
    relationshipApplications: synthesis.relationshipApplications,
    cautions: synthesis.cautions,
    knowledgeSources,
    sopSources,
    provider: 'claude-code-subscription',
    model,
    promptVersion: RESEARCH_PROMPT_VERSION,
    elapsedMs: Math.round(performance.now() - startedAt),
    usage,
  }
}
