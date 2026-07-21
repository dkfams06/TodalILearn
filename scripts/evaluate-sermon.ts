import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { fetchBiblePassages } from '../src/lib/bible/getbible'
import { createResearchBundle } from '../src/lib/research/research'
import { parseBibleReferences } from '../src/lib/search/bible-reference'
import { createSermonDraft, SERMON_MAXIMUM_CHARS, SERMON_MINIMUM_CHARS } from '../src/lib/sermon/generate'
import type { SermonSentence } from '../src/lib/sermon/types'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const cases = [
  { id: 'T1', query: '문제 해결보다 하나님이 함께하시는 것이 더 중요하다' },
  { id: 'T2', query: '작은 일도 하나님께 묻는 관계' },
  { id: 'T3', query: '사랑은 상대를 살리는 선택이다' },
  { id: 'T4', query: '함께 말씀을 읽는 습관이 우리 관계를 어떻게 지켜주는가' },
  { id: 'T5', query: '진리를 안다는 것과 진리대로 산다는 것' },
  { id: 'T6', query: '다니엘 7장의 작은 뿔은 무엇을 의미하는가' },
] as const

function normalizeForQuote(value: string) {
  return value.replace(/[\s"'“”‘’「」『』]+/g, ' ').trim()
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
  const selectedCases = requestedCase ? cases.filter(({ id }) => id === requestedCase) : cases
  if (selectedCases.length === 0) throw new Error(`알 수 없는 평가 ID: ${requestedCase}`)

  const results = []
  for (const { id, query } of selectedCases) {
    console.log(`${id} 연구 시작`)
    const bundle = await createResearchBundle({ database, userId, model, query })
    console.log(`${id} 설교 생성 시작 (대표: ${bundle.biblePassages[0]?.reference})`)
    const sermon = await createSermonDraft({ database, userId, model, research: bundle })

    // 성경 본문을 GetBible에서 독립적으로 다시 조회해 전수 대조한다.
    const refetched = await fetchBiblePassages(
      sermon.biblePassages.flatMap((passage) => parseBibleReferences(passage.reference)),
    )
    const passageTextById = new Map(sermon.biblePassages.map((passage, index) => [
      passage.id,
      normalizeForQuote((refetched[index]?.verses ?? []).map((verse) => verse.text).join(' ')),
    ]))
    const bibleExact = sermon.biblePassages.every((passage, index) =>
      JSON.stringify(passage.verses) === JSON.stringify(refetched[index]?.verses))

    const allSentences: SermonSentence[] = [
      ...sermon.sections.flatMap((section) => section.sentences),
      ...sermon.prayer,
    ]
    const validIds = new Set([
      ...sermon.biblePassages.map((passage) => passage.id),
      ...sermon.knowledgeSources.map((source) => source.id),
      ...sermon.sopSources.map((source) => source.id),
    ])

    const directSentences = allSentences.filter((sentence) => sentence.type === 'direct')
    const scriptureSection = sermon.sections.find((section) => section.sectionId === 'scripture')
    const mainRefetched = refetched[0]
    const scriptureExact = Boolean(scriptureSection && mainRefetched &&
      scriptureSection.sentences.length === mainRefetched.verses.length &&
      scriptureSection.sentences.every((sentence, index) =>
        sentence.text === `${mainRefetched.verses[index].verse}. ${mainRefetched.verses[index].text.trim()}`))
    const directExact = directSentences.every((sentence) => {
      const passageText = sentence.sourceIds.length === 1
        ? passageTextById.get(sentence.sourceIds[0])
        : undefined
      const quote = sentence.text.replace(/^\d+\.\s*/, '')
      return Boolean(passageText && passageText.includes(normalizeForQuote(quote)))
    })

    const evidenceExact = allSentences.every((sentence) =>
      sentence.sourceIds.every((sourceId) => validIds.has(sourceId)))
    const sourcedTypesExact = allSentences.every((sentence) => {
      if (sentence.type === 'summary') return sentence.sourceIds.length >= 1
      if (sentence.type === 'synthesis') return sentence.sourceIds.length >= 2
      if (sentence.type === 'direct') return sentence.sourceIds.length === 1
      return sentence.sourceIds.length === 0
    })

    const offsetsExact = sermon.knowledgeSources.every((source) => {
      const original = sourceByPath.get(source.relativePath)?.raw_markdown
      return typeof original === 'string' &&
        original.slice(source.contentStartOffset, source.contentEndOffset) === source.excerpt
    })
    const sopIds = sermon.sopSources.map((source) => source.chunkId)
    const sopResponse = sopIds.length > 0
      ? await database.from('sop_chunks').select('id,book,chapter,title,chunk_index,content').in('id', sopIds)
      : { data: [], error: null }
    if (sopResponse.error) throw sopResponse.error
    const sopById = new Map((sopResponse.data ?? []).map((row) => [row.id, row]))
    const sopExact = sermon.sopSources.every((source) => {
      const row = sopById.get(source.chunkId)
      return row?.book === source.book && row.chapter === source.chapter &&
        row.title === source.title && row.chunk_index === source.chunkIndex &&
        row.content === source.excerpt
    })

    const questionsExact = sermon.questions.length === 2
    const lengthExact = sermon.totalChars >= SERMON_MINIMUM_CHARS &&
      sermon.totalChars <= SERMON_MAXIMUM_CHARS
    const sourcedSentenceCount = allSentences
      .filter((sentence) => sentence.sourceIds.length > 0).length

    const passed = bibleExact && scriptureExact && directExact && evidenceExact &&
      sourcedTypesExact && offsetsExact && sopExact && questionsExact && lengthExact
    const result = {
      id,
      title: sermon.title,
      mainReference: sermon.biblePassages[0]?.reference,
      totalChars: sermon.totalChars,
      estimatedMinutes: sermon.estimatedMinutes,
      directCount: directSentences.length,
      sourcedSentenceCount,
      bibleExact,
      scriptureExact,
      directExact,
      evidenceExact,
      sourcedTypesExact,
      offsetsExact,
      sopExact,
      questionsExact,
      lengthExact,
      elapsedMs: sermon.elapsedMs,
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
