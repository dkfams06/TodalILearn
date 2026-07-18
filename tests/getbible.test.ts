import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchBiblePassages } from '../src/lib/bible/getbible'
import { parseBibleReferences } from '../src/lib/search/bible-reference'

function responseFor(bookNumber: number, bookName: string, chapter: number, count: number) {
  return new Response(JSON.stringify({
    abbreviation: 'korean',
    book_nr: bookNumber,
    book_name: bookName,
    chapter,
    verses: Array.from({ length: count }, (_, index) => ({
      chapter,
      verse: index + 1,
      text: ` ${chapter}장 ${index + 1}절 원문 `,
    })),
  }))
}

test('같은 장은 한 번만 조회하고 요청한 절 원문만 그대로 반환한다', async () => {
  let calls = 0
  const references = parseBibleReferences('요 3:1-2와 요한복음 3:5')
  const passages = await fetchBiblePassages(references, async () => {
    calls += 1
    return responseFor(43, '요한복음', 3, 10)
  })

  assert.equal(calls, 1)
  assert.deepEqual(passages[0].verses, [
    { verse: 1, text: '3장 1절 원문' },
    { verse: 2, text: '3장 2절 원문' },
  ])
  assert.equal(passages[1].reference, '요한복음 3:5')
})

test('장만 있는 참조와 존재하지 않는 절은 거부한다', async () => {
  await assert.rejects(
    fetchBiblePassages(parseBibleReferences('다니엘 7장'), async () =>
      responseFor(27, '다니엘', 7, 28)),
    /절 범위/,
  )
  await assert.rejects(
    fetchBiblePassages(parseBibleReferences('다니엘 7:29'), async () =>
      responseFor(27, '다니엘', 7, 28)),
    /모든 절/,
  )
})

test('응답의 책 번호가 요청과 다르면 거부한다', async () => {
  await assert.rejects(
    fetchBiblePassages(parseBibleReferences('창세기 1:1'), async () =>
      responseFor(2, '출애굽기', 1, 22)),
    /책·장 정보/,
  )
})
