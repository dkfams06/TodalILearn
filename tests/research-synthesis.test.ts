import assert from 'node:assert/strict'
import test from 'node:test'

import { validateResearchSynthesis } from '../src/lib/research/synthesis'
import { classifyResearchInput } from '../src/lib/research/research'
import { parseBibleReferences } from '../src/lib/search/bible-reference'

function validValue() {
  return {
    mainBibleId: 'B1',
    relatedBibleIds: ['B2'],
    coreMessage: '하나님께 함께 묻는 관계를 선택한다.',
    bibleFlow: [{ statement: '순종의 출발을 살핀다.', bibleIds: ['B1'] }],
    connections: [{ statement: '원문 사례와 본문을 구분해 연결한다.', sourceIds: ['B1', 'K1'] }],
    relationshipApplications: ['결정 전에 함께 기도한다.', '서로의 생각을 먼저 듣는다.'],
    cautions: ['자료의 역사적 주장을 성경 직접 인용처럼 말하지 않는다.'],
    sourceSelections: [{ sourceId: 'K1', reason: '질문의 관계 적용과 직접 연결된다.' }],
  }
}

test('Claude 연구 출력의 모든 근거 ID를 입력 후보와 대조한다', () => {
  const result = validateResearchSynthesis({
    value: validValue(),
    bibleIds: ['B1', 'B2'],
    sourceIds: ['K1', 'S1'],
  })
  assert.equal(result.mainBibleId, 'B1')
  assert.equal(result.sourceSelections.get('K1'), '질문의 관계 적용과 직접 연결된다.')
})

test('선택되지 않은 자료를 연결 문장에서 사용하면 거부한다', () => {
  const value = validValue()
  value.connections[0].sourceIds = ['B1', 'S1']
  assert.throws(() => validateResearchSynthesis({
    value,
    bibleIds: ['B1', 'B2'],
    sourceIds: ['K1', 'S1'],
  }), /선택되지 않은 근거/)
})

test('사용자가 선택을 강제한 경우 그 자료만 유효한 연결 근거가 된다', () => {
  const value = validValue()
  value.sourceSelections = []
  const result = validateResearchSynthesis({
    value,
    bibleIds: ['B1', 'B2'],
    sourceIds: ['K1', 'S1'],
    forcedSourceIds: ['K1'],
  })
  assert.deepEqual(result.connections[0].sourceIds, ['B1', 'K1'])
})

test('본문·사회·관계·일반 질문의 입력 유형을 구분한다', () => {
  assert.equal(classifyResearchInput('다니엘 7장의 작은 뿔', parseBibleReferences('다니엘 7장')), 'bible_reference')
  assert.equal(classifyResearchInput('사회 문제를 어떻게 대화할까', []), 'social')
  assert.equal(classifyResearchInput('작은 일도 함께 결정하는 관계', []), 'relationship')
  assert.equal(classifyResearchInput('은혜란 무엇인가', []), 'theme')
})
