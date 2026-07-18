import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bibleReferenceSimilarity,
  parseBibleReferences,
} from '../src/lib/search/bible-reference'
import { analyzeSearchQuery } from '../src/lib/search/query'
import {
  exactReferenceMatch,
  normalizeSemanticScore,
  termCoverage,
} from '../src/lib/search/ranking'

test('한국어 장·절과 약칭을 표준 성경 참조로 정규화한다', () => {
  const references = parseBibleReferences(
    '다니엘 7장의 작은 뿔과 수 6:12-16, 창세기 45장 5절을 비교한다.',
  )
  assert.deepEqual(
    references.map((reference) => reference.normalized),
    ['다니엘 7장', '여호수아 6:12-16', '창세기 45:5'],
  )
  assert.deepEqual(references.map((reference) => reference.bookNumber), [27, 6, 1])
})

test('같은 책·장은 절 표기 유무와 관계없이 정확 참조로 취급한다', () => {
  const [chapter] = parseBibleReferences('다니엘 7장')
  const [verse] = parseBibleReferences('단 7:25')
  const [different] = parseBibleReferences('다니엘 2장')
  assert.equal(bibleReferenceSimilarity(chapter, verse), 1)
  assert.equal(bibleReferenceSimilarity(chapter, different), 0)
})

test('검색어에서 조사와 일반 질문어를 제거하고 핵심어를 남긴다', () => {
  const analysis = analyzeSearchQuery('작은 일도 하나님께 묻는 관계')
  assert.ok(analysis.terms.includes('하나님께'))
  assert.ok(analysis.terms.includes('관계'))
  assert.ok(!analysis.terms.includes('일도'))
})

test('정확 본문·텍스트·의미 점수를 0~1 신호로 계산한다', () => {
  const queryReferences = parseBibleReferences('다니엘 7장')
  assert.equal(exactReferenceMatch(queryReferences, '다니엘 7장 25절').score, 1)
  assert.equal(termCoverage('하나님이 함께하시는 믿음', ['하나님', '믿음']), 1)
  assert.equal(normalizeSemanticScore(0.65), 0)
  assert.equal(normalizeSemanticScore(0.9), 1)
})
