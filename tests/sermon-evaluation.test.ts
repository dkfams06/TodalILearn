import assert from 'node:assert/strict'
import test from 'node:test'

import { EVALUATION_ITEMS, parseEditReasons, parseEvaluationInput } from '../src/lib/sermon/evaluation'
import type { EvaluationScores } from '../src/lib/sermon/types'

function fullScores(value = 4): EvaluationScores {
  return Object.fromEntries(EVALUATION_ITEMS.map((item) => [item.key, value])) as EvaluationScores
}

test('12개 항목 점수와 판정을 검증해 통과한다', () => {
  const input = parseEvaluationInput({
    scores: fullScores(5),
    verdict: 'ready',
    note: '  좋았음  ',
    versionNumber: 2,
  })
  assert.equal(input.verdict, 'ready')
  assert.equal(input.note, '좋았음')
  assert.equal(input.versionNumber, 2)
  assert.equal(Object.keys(input.scores).length, 12)
})

test('항목이 빠지면 거부한다', () => {
  const scores = fullScores()
  delete (scores as Record<string, unknown>).tone
  assert.throws(() => parseEvaluationInput({ scores, verdict: 'ready' }), /말투/)
})

test('점수 범위를 벗어나면 거부한다', () => {
  assert.throws(() => parseEvaluationInput({ scores: fullScores(6), verdict: 'ready' }), /1~5/)
  assert.throws(() => parseEvaluationInput({ scores: fullScores(0), verdict: 'ready' }), /1~5/)
})

test('알 수 없는 판정을 거부한다', () => {
  assert.throws(() => parseEvaluationInput({ scores: fullScores(), verdict: 'perfect' }), /판정/)
})

test('versionNumber 없이도 저장할 수 있다', () => {
  const input = parseEvaluationInput({ scores: fullScores(3), verdict: 'minor_edit' })
  assert.equal(input.versionNumber, null)
  assert.equal(input.note, null)
})

test('수정 사유 태그를 화이트리스트로 검증하고 중복을 제거한다', () => {
  assert.deepEqual(parseEditReasons(['tone', 'tone', 'citation']), ['tone', 'citation'])
  assert.deepEqual(parseEditReasons(undefined), [])
  assert.throws(() => parseEditReasons(['unknown']), /수정 사유/)
})
