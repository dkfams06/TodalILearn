import path from 'node:path'

import dotenv from 'dotenv'

import {
  CLAUDE_SUBSCRIPTION_PROVIDER,
  getClaudeSubscriptionStatus,
  runClaudePrint,
} from '../src/lib/claude/print'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

async function main() {
  const status = await getClaudeSubscriptionStatus()
  if (!status.available || !status.loggedIn) {
    throw new Error(status.message ?? 'Claude.ai 구독 로그인이 필요합니다.')
  }

  const model = process.env.ANTHROPIC_ANALYSIS_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
  const result = await runClaudePrint<{ status: 'ok'; message: string }>({
    model,
    systemPrompt: '구조화 출력 연결을 점검합니다. 요청된 JSON만 반환하세요.',
    prompt: 'status는 ok, message는 구독 연결 확인이라는 짧은 한국어 문장으로 반환하세요.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['ok'] },
        message: { type: 'string' },
      },
      required: ['status', 'message'],
    },
    timeoutMs: 2 * 60 * 1000,
  })

  console.log(JSON.stringify({
    provider: CLAUDE_SUBSCRIPTION_PROVIDER,
    model,
    cliVersion: status.version,
    subscriptionType: status.subscriptionType,
    structuredOutput: result.data.status,
    usage: result.usage,
    status: 'OK',
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

