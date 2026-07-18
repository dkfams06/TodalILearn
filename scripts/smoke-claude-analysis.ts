import path from 'node:path'

import dotenv from 'dotenv'

import { CLAUDE_SUBSCRIPTION_PROVIDER } from '../src/lib/claude/print'
import { analyzeDocument } from '../src/lib/knowledge/analysis'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const markdown = `# 믿음과 사랑

믿음은 상황이 보이지 않을 때에도 하나님의 약속을 신뢰하는 태도입니다.

기도는 서로의 마음을 하나님 앞에 함께 내려놓고 같은 방향을 바라보게 합니다.

사랑은 감정에 머물지 않고 오늘 곁에 있는 사람을 섬기는 구체적인 선택으로 나타납니다.`

async function main() {
  const model = process.env.ANTHROPIC_ANALYSIS_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
  const analysis = await analyzeDocument({
    model,
    title: '믿음과 사랑',
    markdown,
  })

  console.log(JSON.stringify({
    provider: CLAUDE_SUBSCRIPTION_PROVIDER,
    model,
    keyClaims: analysis.key_claims.length,
    evidenceOffsetsValid: analysis.key_claims.every((claim) =>
      markdown.slice(claim.content_start_offset, claim.content_end_offset) === claim.evidence_quote),
    usage: analysis.usage,
    status: 'OK',
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

