import assert from 'node:assert/strict'
import test from 'node:test'

import { diffLines } from '../src/lib/sermon/diff'

test('동일 텍스트는 변경이 없다', () => {
  const { ops, stats } = diffLines('가\n나\n다', '가\n나\n다')
  assert.equal(stats.added, 0)
  assert.equal(stats.removed, 0)
  assert.equal(stats.changed, 0)
  assert.equal(stats.charChangeRatio, 0)
  assert.ok(ops.every((op) => op.type === 'equal'))
})

test('추가된 라인을 감지한다', () => {
  const { ops, stats } = diffLines('가\n다', '가\n나\n다')
  assert.equal(stats.added, 1)
  assert.equal(stats.removed, 0)
  assert.deepEqual(ops.map((op) => op.type), ['equal', 'add', 'equal'])
  assert.equal(ops[1].text, '나')
})

test('삭제된 라인을 감지한다', () => {
  const { ops, stats } = diffLines('가\n나\n다', '가\n다')
  assert.equal(stats.removed, 1)
  assert.equal(stats.added, 0)
  assert.deepEqual(ops.map((op) => op.type), ['equal', 'remove', 'equal'])
  assert.equal(ops[1].text, '나')
})

test('한 라인 교체는 추가 1 삭제 1 교체 1로 계산한다', () => {
  const { stats } = diffLines('가\n나\n다', '가\n라\n다')
  assert.equal(stats.added, 1)
  assert.equal(stats.removed, 1)
  assert.equal(stats.changed, 1)
})

test('문자 변화율을 계산한다', () => {
  const { stats } = diffLines('12345', '1234567890')
  assert.equal(stats.beforeChars, 5)
  assert.equal(stats.afterChars, 10)
  assert.equal(stats.charChangeRatio, 1)
})

test('빈 원본에서 새 내용은 모두 추가로 본다', () => {
  const { stats } = diffLines('', '가\n나')
  assert.equal(stats.added, 2)
  assert.equal(stats.removed, 0)
})

test('CRLF과 끝 개행 차이는 변경으로 세지 않는다', () => {
  const { stats } = diffLines('가\r\n나\r\n', '가\n나')
  assert.equal(stats.added, 0)
  assert.equal(stats.removed, 0)
})
