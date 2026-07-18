import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { fetchBiblePassages } from '../src/lib/bible/getbible'
import { createResearchBundle } from '../src/lib/research/research'
import { parseBibleReferences } from '../src/lib/search/bible-reference'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const cases = [
  { id: 'T1', query: '문제 해결보다 하나님이 함께하시는 것이 더 중요하다', mainBooks: ['여호수아', '출애굽기'], expected: [['이스라엘의 승리법칙']] },
  { id: 'T2', query: '작은 일도 하나님께 묻는 관계', mainBooks: ['여호수아'], expected: [['이스라엘의 승리법칙']] },
  { id: 'T3', query: '사랑은 상대를 살리는 선택이다', mainBooks: ['창세기'], expected: [['모든 창고를 열고']] },
  { id: 'T4', query: '함께 말씀을 읽는 습관이 우리 관계를 어떻게 지켜주는가', mainBooks: ['마태복음', '요한계시록', '로마서', '요한일서'], expected: [['하나님이 가장 기뻐하시고 사탄이 가장 싫어하는 일']] },
  { id: 'T5', query: '진리를 안다는 것과 진리대로 산다는 것', mainBooks: ['창세기', '마태복음', '요한계시록', '로마서', '요한일서'], expected: [['모든 창고를 열고'], ['하나님이 가장 기뻐하시고 사탄이 가장 싫어하는 일']] },
  { id: 'T6', query: '다니엘 7장의 작은 뿔은 무엇을 의미하는가', mainBooks: ['다니엘'], expected: [['7월 11일 - 예배 설교']] },
  { id: 'T7', query: '우리의 의견이 다른 사회 문제를 신앙적으로 어떻게 대화해야 할까', mainBooks: ['창세기', '갈라디아서', '여호수아'], expected: [['창세기 24강', '창세기 25강']] },
  { id: 'T8', query: '그리스도인은 사회를 섬기며 어떤 역할을 해야 하는가', mainBooks: ['갈라디아서', '창세기'], expected: [['대한민국 운명 기독교에 답이 있다']] },
] as const

function includesAny(title: string, fragments: readonly string[]) {
  return fragments.some((fragment) => title.includes(fragment))
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5'
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')
  const database = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sourceRows, error: sourceError } = await database
    .from('obsidian_sources')
    .select('id,user_id,relative_path,raw_markdown')
    .eq('source_deleted', false)
  if (sourceError) throw sourceError
  const sources = sourceRows ?? []
  const userId = sources[0]?.user_id
  if (!userId) throw new Error('평가할 옵시디언 원문이 없습니다.')
  const sourceByPath = new Map(sources.map((source) => [source.relative_path, source]))
  const requestedCase = process.argv.find((argument) => argument.startsWith('--case='))?.split('=')[1]
  const emptySources = process.argv.includes('--empty-sources')
  const selectedCases = requestedCase ? cases.filter(({ id }) => id === requestedCase) : cases
  if (selectedCases.length === 0) throw new Error(`알 수 없는 평가 ID: ${requestedCase}`)

  const results = []
  for (const item of selectedCases) {
    const { id, query } = item
    console.log(`${id} 연구 시작`)
    const bundle = await createResearchBundle({
      database,
      userId,
      model,
      query,
      ...(emptySources ? { selectedKnowledgeIds: [], selectedSopIds: [] } : {}),
    })
    const actualPassages = await fetchBiblePassages(
      bundle.biblePassages.flatMap((passage) => parseBibleReferences(passage.reference)),
    )
    const bibleExact = bundle.biblePassages.every((passage, index) =>
      JSON.stringify(passage.verses) === JSON.stringify(actualPassages[index]?.verses))
    const offsetsExact = bundle.knowledgeSources.every((source) => {
      const original = sourceByPath.get(source.relativePath)?.raw_markdown
      return typeof original === 'string' &&
        original.slice(source.contentStartOffset, source.contentEndOffset) === source.excerpt
    })
    const sopIds = bundle.sopSources.map((source) => source.chunkId)
    const sopResponse = sopIds.length > 0
      ? await database.from('sop_chunks').select('id,book,chapter,title,chunk_index,content').in('id', sopIds)
      : { data: [], error: null }
    if (sopResponse.error) throw sopResponse.error
    const sopById = new Map((sopResponse.data ?? []).map((row) => [row.id, row]))
    const sopExact = bundle.sopSources.every((source) => {
      const row = sopById.get(source.chunkId)
      return row?.book === source.book && row.chapter === source.chapter &&
        row.title === source.title && row.chunk_index === source.chunkIndex &&
        row.content === source.excerpt
    })
    const validEvidenceIds = new Set([
      ...bundle.biblePassages.map((passage) => passage.id),
      ...bundle.knowledgeSources.filter((source) => source.selected).map((source) => source.id),
      ...bundle.sopSources.filter((source) => source.selected).map((source) => source.id),
    ])
    const evidenceExact = bundle.connections.every((connection) =>
      connection.sourceIds.every((sourceId) => validEvidenceIds.has(sourceId)))
    const mainRelevant = item.mainBooks.some((book) => book === bundle.biblePassages[0]?.book)
    const selectedTitles = bundle.knowledgeSources
      .filter((source) => source.selected)
      .map((source) => source.title)
    const expectedKnowledgeSelected = emptySources || item.expected.every((acceptableTitles) =>
      selectedTitles.some((title) => includesAny(title, acceptableTitles)))
    const emptySelectionExact = !emptySources || (
      bundle.knowledgeSources.every((source) => !source.selected) &&
      bundle.sopSources.every((source) => !source.selected) &&
      bundle.connections.every((connection) =>
        connection.sourceIds.every((sourceId) => sourceId.startsWith('B')))
    )
    const passed = bundle.biblePassages.length > 0 && bibleExact && offsetsExact && sopExact &&
      evidenceExact && mainRelevant && expectedKnowledgeSelected && emptySelectionExact
    const result = {
      id,
      mainReference: bundle.biblePassages[0]?.reference,
      relatedReferences: bundle.biblePassages.slice(1).map((passage) => passage.reference),
      selectedKnowledge: bundle.knowledgeSources.filter((source) => source.selected).map((source) => `${source.id}:${source.title}`),
      selectedSop: bundle.sopSources.filter((source) => source.selected).map((source) => `${source.id}:${source.title}`),
      bibleExact,
      offsetsExact,
      sopExact,
      evidenceExact,
      mainRelevant,
      expectedKnowledgeSelected,
      emptySelectionExact,
      elapsedMs: bundle.elapsedMs,
      passed,
    }
    results.push(result)
    console.log(JSON.stringify(result))
  }

  const summary = { status: results.every((result) => result.passed) ? 'OK' : 'FAILED', results }
  console.log(JSON.stringify(summary))
  if (summary.status !== 'OK') process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
