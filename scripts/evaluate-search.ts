import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { hybridSearch } from '../src/lib/search/hybrid'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const cases = [
  {
    id: 'T1',
    query: '문제 해결보다 하나님이 함께하시는 것이 더 중요하다',
    expected: ['이스라엘의 승리법칙'],
  },
  {
    id: 'T2',
    query: '작은 일도 하나님께 묻는 관계',
    expected: ['이스라엘의 승리법칙'],
  },
  {
    id: 'T3',
    query: '사랑은 상대를 살리는 선택이다',
    expected: ['모든 창고를 열고'],
  },
  {
    id: 'T4',
    query: '함께 말씀을 읽는 습관이 우리 관계를 어떻게 지켜주는가',
    expected: ['하나님이 가장 기뻐하시고 사탄이 가장 싫어하는 일'],
  },
  {
    id: 'T5',
    query: '진리를 안다는 것과 진리대로 산다는 것',
    expected: ['모든 창고를 열고', '하나님이 가장 기뻐하시고 사탄이 가장 싫어하는 일'],
  },
  {
    id: 'T6',
    query: '다니엘 7장의 작은 뿔은 무엇을 의미하는가',
    expected: ['7월 11일 - 예배 설교'],
  },
  {
    id: 'T7',
    query: '우리의 의견이 다른 사회 문제를 신앙적으로 어떻게 대화해야 할까',
    expected: ['창세기 24강', '창세기 25강'],
  },
  {
    id: 'T8',
    query: '그리스도인은 사회를 섬기며 어떤 역할을 해야 하는가',
    expected: ['대한민국 운명 기독교에 답이 있다'],
  },
] as const

function titleMatches(title: string, expected: string) {
  return title.normalize('NFKC').includes(expected.normalize('NFKC'))
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')
  const database = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sourceRows, error: sourceError } = await database
    .from('obsidian_sources')
    .select('id,user_id,title,raw_markdown')
    .eq('source_deleted', false)
  if (sourceError) throw sourceError
  const sources = sourceRows ?? []
  const userId = sources[0]?.user_id
  if (!userId) throw new Error('평가할 옵시디언 원문이 없습니다.')
  const sourceById = new Map(sources.map((source) => [source.id, source]))

  const results = []
  let brokenOffsets = 0
  for (const item of cases) {
    const response = await hybridSearch({ database, userId, query: item.query })
    for (const result of response.knowledgeResults) {
      const source = sourceById.get(result.sourceId)
      if (
        !source ||
        source.raw_markdown.slice(result.contentStartOffset, result.contentEndOffset) !== result.content
      ) brokenOffsets += 1
    }
    const ranks = item.expected.map((expected) => {
      const index = response.knowledgeResults.findIndex((result) =>
        titleMatches(result.title, expected))
      return index === -1 ? null : index + 1
    })
    results.push({
      id: item.id,
      query: item.query,
      expected: item.expected,
      ranks,
      topTitles: response.knowledgeResults.slice(0, 5).map((result) => result.title),
      topScores: response.knowledgeResults.slice(0, 5).map((result) => result.signals.finalScore),
      elapsedMs: response.elapsedMs,
    })
    console.log(`${item.id}: ${ranks.map((rank) => rank ?? '-').join(', ')} | ${results.at(-1)?.topTitles.join(' > ')}`)
  }

  const discovery = []
  for (const source of sources) {
    const response = await hybridSearch({ database, userId, query: source.title ?? '' })
    const rank = response.knowledgeResults.findIndex((result) => result.sourceId === source.id)
    discovery.push({ title: source.title, rank: rank === -1 ? null : rank + 1 })
  }

  const primary = results.slice(0, 6)
  const recallAt5Passed = primary.every((result) =>
    result.ranks.every((rank) => rank !== null && rank <= 5))
  const top3Cases = primary.filter((result) =>
    result.ranks.some((rank) => rank !== null && rank <= 3)).length
  const discoveryPassed = discovery.every((result) => result.rank !== null && result.rank <= 3)
  const summary = {
    recallAt5Passed,
    top3Cases,
    discoveryPassed,
    brokenOffsets,
    cases: results,
    discovery,
    status:
      recallAt5Passed && top3Cases >= 5 && discoveryPassed && brokenOffsets === 0
        ? 'OK'
        : 'NEEDS_TUNING',
  }
  console.log(JSON.stringify(summary))
  if (summary.status !== 'OK') process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

