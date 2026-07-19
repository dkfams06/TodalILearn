import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env/server'
import { createResearchBundle } from '@/lib/research/research'
import type { ResearchRequest } from '@/lib/research/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

function selectedIds(value: unknown, prefix: 'K' | 'S', field: string) {
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.length > 12 ||
    value.some((item) => typeof item !== 'string' || !new RegExp(`^${prefix}\\d+$`).test(item))
  ) {
    throw new Error(`${field}가 올바르지 않습니다.`)
  }
  return [...new Set(value as string[])]
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  let body: ResearchRequest
  try {
    body = await request.json() as ResearchRequest
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
  }

  try {
    if (typeof body.query !== 'string') throw new Error('연구 질문이 필요합니다.')
    if (body.personalContext !== undefined && typeof body.personalContext !== 'string') {
      throw new Error('두 사람의 상황은 문자열이어야 합니다.')
    }
    const personalContext = body.personalContext?.trim() ?? ''
    if (personalContext.length > 500) throw new Error('두 사람의 상황은 500자 이하여야 합니다.')
    const selectedKnowledgeIds = selectedIds(
      body.selectedKnowledgeIds,
      'K',
      'selectedKnowledgeIds',
    )
    const selectedSopIds = selectedIds(body.selectedSopIds, 'S', 'selectedSopIds')
    const env = getServerEnv()
    const result = await createResearchBundle({
      database: createAdminClient(),
      userId: user.id,
      model: env.anthropicModel,
      query: body.query,
      personalContext,
      selectedKnowledgeIds,
      selectedSopIds,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '연구 묶음을 만들지 못했습니다.'
    const clientError = /필요|올바르지|이하여야|후보가 아닌|찾지 못했습니다/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
