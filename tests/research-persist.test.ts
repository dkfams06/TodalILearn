import assert from 'node:assert/strict'
import test from 'node:test'

import { validateResearchBundle } from '../src/lib/research/persist'

function bundle() {
  return {
    query: '기도할 말이 없을 때',
    inputType: 'theme',
    personalContext: '',
    coreMessage: '말이 없어도 하나님 앞에 머무는 것이 기도다.',
    biblePassages: [],
    bibleFlow: [],
    connections: [],
    relationshipApplications: [],
    cautions: [],
    knowledgeSources: [],
    sopSources: [],
    provider: 'claude-code-subscription',
    model: 'claude-sonnet',
    promptVersion: 'research-v1',
    elapsedMs: 100,
    usage: { inputTokens: null, outputTokens: null },
  }
}

test('완성된 연구 묶음을 저장 가능한 값으로 검증한다', () => {
  assert.equal(validateResearchBundle(bundle()).query, '기도할 말이 없을 때')
})

test('핵심 필드가 없는 연구 묶음은 거부한다', () => {
  assert.throws(
    () => validateResearchBundle({ ...bundle(), coreMessage: '' }),
    /형식이 올바르지 않습니다/,
  )
})
