import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchBiblePassages, type BibleFetch } from '@/lib/bible/getbible'
import { parseBibleReferences } from '@/lib/search/bible-reference'
import type {
  ResearchBiblePassage,
  ResearchBibleFlow,
  ResearchBundle,
  ResearchConnection,
  ResearchKnowledgeSource,
  ResearchSopSource,
} from '@/lib/research/types'

const INPUT_TYPES = ['bible_reference', 'relationship', 'social', 'theme'] as const

export type VerifiedResearch = {
  query: string
  inputType: ResearchBundle['inputType']
  personalContext: string
  coreMessage: string
  bibleFlow: ResearchBibleFlow[]
  connections: ResearchConnection[]
  relationshipApplications: string[]
  cautions: string[]
  biblePassages: ResearchBiblePassage[]
  knowledgeSources: ResearchKnowledgeSource[]
  sopSources: ResearchSopSource[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== 'string') throw new Error(`${field}가 문자열이 아닙니다.`)
  const trimmed = value.trim()
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new Error(`${field}는 ${minimum}~${maximum}자여야 합니다.`)
  }
  return trimmed
}

function boundedStringArray(
  value: unknown,
  field: string,
  minimumItems: number,
  maximumItems: number,
) {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    throw new Error(`${field}는 ${minimumItems}~${maximumItems}개여야 합니다.`)
  }
  return value.map((item, index) => boundedString(item, `${field}[${index}]`, 1, 500))
}

function idOf(value: unknown, field: string, prefix: 'B' | 'K' | 'S', seen: Set<string>) {
  const id = boundedString(value, field, 2, 5)
  if (!new RegExp(`^${prefix}\\d+$`).test(id)) throw new Error(`${field}가 ${prefix}* 형식이 아닙니다.`)
  if (seen.has(id)) throw new Error(`${field} ${id}가 중복되었습니다.`)
  seen.add(id)
  return id
}

function statementsWithIds(
  value: unknown,
  field: string,
  maximumItems: number,
  allowedIds: Set<string>,
  minimumIds: number,
) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new Error(`${field}는 최대 ${maximumItems}개여야 합니다.`)
  }
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${field}[${index}]가 객체가 아닙니다.`)
    const rawIds = Array.isArray(item.sourceIds ?? item.bibleIds) ? (item.sourceIds ?? item.bibleIds) as unknown[] : null
    if (!rawIds || rawIds.length < minimumIds) {
      throw new Error(`${field}[${index}]의 근거 ID가 부족합니다.`)
    }
    const ids = [...new Set(rawIds.map((id, idIndex) =>
      boundedString(id, `${field}[${index}].ids[${idIndex}]`, 2, 5)))]
    if (ids.some((id) => !allowedIds.has(id))) {
      throw new Error(`${field}[${index}]가 검증된 후보에 없는 ID를 참조합니다.`)
    }
    return { statement: boundedString(item.statement, `${field}[${index}].statement`, 1, 500), ids }
  })
}

type KnowledgeChunkRow = {
  id: string
  source_id: string
  section_name: string | null
  content: string
  content_start_offset: number
  content_end_offset: number
}

type ObsidianSourceRow = {
  id: string
  user_id: string
  title: string
  relative_path: string
}

type SopChunkRow = {
  id: string
  book: string
  chapter: number
  title: string
  chunk_index: number
  content: string
}

// 클라이언트가 보낸 연구 묶음을 신뢰하지 않고, 성경은 GetBible에서,
// 자료 원문은 DB에서 다시 조회해 검증된 연구 입력을 만든다.
export async function verifyResearchForSermon({
  database,
  userId,
  research,
  fetcher,
}: {
  database: SupabaseClient
  userId: string
  research: unknown
  fetcher?: BibleFetch
}): Promise<VerifiedResearch> {
  if (!isRecord(research)) throw new Error('연구 묶음이 필요합니다.')

  const query = boundedString(research.query, '연구 질문', 2, 300)
  const personalContext = research.personalContext === undefined || research.personalContext === ''
    ? ''
    : boundedString(research.personalContext, '두 사람의 상황', 1, 500)
  const inputType = INPUT_TYPES.find((type) => type === research.inputType)
  if (!inputType) throw new Error('연구 입력 유형이 올바르지 않습니다.')
  const coreMessage = boundedString(research.coreMessage, '핵심 메시지', 1, 1000)

  if (!Array.isArray(research.biblePassages) || research.biblePassages.length < 1 || research.biblePassages.length > 5) {
    throw new Error('성경 본문은 1~5개여야 합니다.')
  }
  const bibleIdSet = new Set<string>()
  const passageInputs = research.biblePassages.map((item, index) => {
    if (!isRecord(item)) throw new Error(`biblePassages[${index}]가 객체가 아닙니다.`)
    const id = idOf(item.id, `biblePassages[${index}].id`, 'B', bibleIdSet)
    const role = index === 0 ? 'main' as const : 'related' as const
    const references = parseBibleReferences(boundedString(item.reference, `biblePassages[${index}].reference`, 2, 60))
    const reference = references.length === 1 ? references[0] : null
    if (!reference || reference.verseStart === null) {
      throw new Error(`biblePassages[${index}]의 참조를 해석하지 못했습니다.`)
    }
    return { id, role, reference }
  })
  const fetchedPassages = await fetchBiblePassages(
    passageInputs.map((input) => input.reference),
    fetcher,
  )
  const biblePassages: ResearchBiblePassage[] = fetchedPassages.map((passage, index) => ({
    ...passage,
    id: passageInputs[index].id,
    role: passageInputs[index].role,
  }))

  const knowledgeSelections = collectSelections(research.knowledgeSources, 'knowledgeSources', 'K', 12)
  const sopSelections = collectSelections(research.sopSources, 'sopSources', 'S', 12)

  const knowledgeSources = await verifyKnowledgeSelections(database, userId, knowledgeSelections)
  const sopSources = await verifySopSelections(database, sopSelections)

  const allIds = new Set([
    ...biblePassages.map((passage) => passage.id),
    ...knowledgeSources.map((source) => source.id),
    ...sopSources.map((source) => source.id),
  ])
  const bibleIds = new Set(biblePassages.map((passage) => passage.id))

  const bibleFlow = statementsWithIds(research.bibleFlow, 'bibleFlow', 6, bibleIds, 1)
    .map((item): ResearchBibleFlow => ({ statement: item.statement, bibleIds: item.ids }))
  if (bibleFlow.length === 0) throw new Error('bibleFlow는 1개 이상이어야 합니다.')
  const connections = statementsWithIds(research.connections, 'connections', 8, allIds, 1)
    .map((item): ResearchConnection => ({ statement: item.statement, sourceIds: item.ids }))
  const relationshipApplications = boundedStringArray(
    research.relationshipApplications, 'relationshipApplications', 2, 5,
  )
  const cautions = boundedStringArray(research.cautions, 'cautions', 1, 5)

  return {
    query,
    inputType,
    personalContext,
    coreMessage,
    bibleFlow,
    connections,
    relationshipApplications,
    cautions,
    biblePassages,
    knowledgeSources,
    sopSources,
  }
}

type SourceSelection = {
  id: string
  chunkId: string
  selectionReason: string
}

function collectSelections(
  value: unknown,
  field: string,
  prefix: 'K' | 'S',
  maximumItems: number,
) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maximumItems * 2) {
    throw new Error(`${field}가 올바르지 않습니다.`)
  }
  const seen = new Set<string>()
  const selections: SourceSelection[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) throw new Error(`${field}[${index}]가 객체가 아닙니다.`)
    if (item.selected !== true) continue
    selections.push({
      id: idOf(item.id, `${field}[${index}].id`, prefix, seen),
      chunkId: boundedString(item.chunkId, `${field}[${index}].chunkId`, 8, 64),
      selectionReason: boundedString(item.selectionReason, `${field}[${index}].selectionReason`, 1, 500),
    })
  }
  if (selections.length > maximumItems) {
    throw new Error(`${field} 선택 자료는 최대 ${maximumItems}개여야 합니다.`)
  }
  return selections
}

async function verifyKnowledgeSelections(
  database: SupabaseClient,
  userId: string,
  selections: SourceSelection[],
): Promise<ResearchKnowledgeSource[]> {
  if (selections.length === 0) return []
  const chunkResponse = await database
    .from('knowledge_chunks')
    .select('id,source_id,section_name,content,content_start_offset,content_end_offset')
    .in('id', selections.map((selection) => selection.chunkId))
  if (chunkResponse.error) throw new Error(chunkResponse.error.message)
  const chunkById = new Map(((chunkResponse.data ?? []) as KnowledgeChunkRow[]).map((row) => [row.id, row]))

  const sourceIds = [...new Set([...chunkById.values()].map((row) => row.source_id))]
  const sourceResponse = sourceIds.length > 0
    ? await database
        .from('obsidian_sources')
        .select('id,user_id,title,relative_path')
        .in('id', sourceIds)
        .eq('user_id', userId)
        .eq('source_deleted', false)
    : { data: [], error: null }
  if (sourceResponse.error) throw new Error(sourceResponse.error.message)
  const sourceById = new Map(((sourceResponse.data ?? []) as ObsidianSourceRow[]).map((row) => [row.id, row]))

  return selections.map((selection) => {
    const chunk = chunkById.get(selection.chunkId)
    const source = chunk ? sourceById.get(chunk.source_id) : undefined
    if (!chunk || !source) {
      throw new Error(`옵시디언 자료 ${selection.id}의 원문을 DB에서 찾지 못했습니다.`)
    }
    return {
      id: selection.id,
      chunkId: chunk.id,
      selected: true,
      selectionReason: selection.selectionReason,
      title: source.title,
      relativePath: source.relative_path,
      sectionName: chunk.section_name ?? '',
      contentStartOffset: chunk.content_start_offset,
      contentEndOffset: chunk.content_end_offset,
      excerpt: chunk.content,
    }
  })
}

async function verifySopSelections(
  database: SupabaseClient,
  selections: SourceSelection[],
): Promise<ResearchSopSource[]> {
  if (selections.length === 0) return []
  const response = await database
    .from('sop_chunks')
    .select('id,book,chapter,title,chunk_index,content')
    .in('id', selections.map((selection) => selection.chunkId))
  if (response.error) throw new Error(response.error.message)
  const rowById = new Map(((response.data ?? []) as SopChunkRow[]).map((row) => [row.id, row]))

  return selections.map((selection) => {
    const row = rowById.get(selection.chunkId)
    if (!row) throw new Error(`예언의 신 자료 ${selection.id}의 원문을 DB에서 찾지 못했습니다.`)
    return {
      id: selection.id,
      chunkId: row.id,
      selected: true,
      selectionReason: selection.selectionReason,
      book: row.book,
      chapter: row.chapter,
      title: row.title,
      chunkIndex: row.chunk_index,
      excerpt: row.content,
    }
  })
}
