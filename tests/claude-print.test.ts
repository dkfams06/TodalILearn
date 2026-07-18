import assert from 'node:assert/strict'
import test from 'node:test'

import { createClaudeSubscriptionEnvironment } from '../src/lib/claude/print'

test('Claude 구독 실행 환경에서 API 인증 변수를 제거한다', () => {
  const environment = createClaudeSubscriptionEnvironment({
    PATH: 'example-path',
    ANTHROPIC_API_KEY: 'must-not-pass',
    ANTHROPIC_AUTH_TOKEN: 'must-not-pass',
    ANTHROPIC_BASE_URL: 'https://example.invalid',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_USE_VERTEX: '1',
    CLAUDE_CODE_USE_FOUNDRY: '1',
    CLAUDE_CODE_OAUTH_TOKEN: 'subscription-token-is-allowed',
  })

  assert.equal(environment.PATH, 'example-path')
  assert.equal(environment.CLAUDE_CODE_OAUTH_TOKEN, 'subscription-token-is-allowed')
  assert.equal(environment.ANTHROPIC_API_KEY, undefined)
  assert.equal(environment.ANTHROPIC_AUTH_TOKEN, undefined)
  assert.equal(environment.ANTHROPIC_BASE_URL, undefined)
  assert.equal(environment.CLAUDE_CODE_USE_BEDROCK, undefined)
  assert.equal(environment.CLAUDE_CODE_USE_VERTEX, undefined)
  assert.equal(environment.CLAUDE_CODE_USE_FOUNDRY, undefined)
})

