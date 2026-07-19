import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env/server'
import { getExecutionMode } from '@/lib/execution/mode'
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

  let body: ResearchRequest & { deviceId?: unknown }
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
    if (getExecutionMode() === 'web') {
      if (typeof body.deviceId !== 'string') {
        throw new Error('온라인 Windows PC를 선택해 주세요.')
      }
      const database = createAdminClient()
      const onlineAfter = new Date(Date.now() - 45_000).toISOString()
      const { data: device, error: deviceError } = await database
        .from('local_devices')
        .select('id')
        .eq('id', body.deviceId)
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .gte('last_seen_at', onlineAfter)
        .maybeSingle()
      if (deviceError) throw new Error(deviceError.message)
      if (!device) throw new Error('선택한 PC가 오프라인입니다. Companion을 실행해 주세요.')

      const payload: ResearchRequest = {
        query: body.query,
        personalContext,
        ...(selectedKnowledgeIds ? { selectedKnowledgeIds } : {}),
        ...(selectedSopIds ? { selectedSopIds } : {}),
      }
      const { data: job, error: jobError } = await database
        .from('local_jobs')
        .insert({
          user_id: user.id,
          device_id: device.id,
          job_type: 'research',
          payload,
        })
        .select('id,status')
        .single()
      if (jobError) throw new Error(jobError.message)
      return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
    }

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
