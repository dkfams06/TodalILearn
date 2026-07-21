import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env/server'
import { getExecutionMode } from '@/lib/execution/mode'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getCurrentUser>>
  try {
    user = await getCurrentUser()
  } catch (error) {
    const message = error instanceof Error ? error.message : '사용자를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  let body: { research?: unknown }
  try {
    body = await request.json() as { research?: unknown }
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
  }
  if (!body.research || typeof body.research !== 'object' || Array.isArray(body.research)) {
    return NextResponse.json({ error: '연구 묶음이 필요합니다.' }, { status: 400 })
  }

  try {
    if (getExecutionMode() === 'web') {
      const database = createAdminClient()
      const onlineAfter = new Date(Date.now() - 45_000).toISOString()
      const { data: device, error: deviceError } = await database
        .from('local_devices')
        .select('id')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .gte('last_seen_at', onlineAfter)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (deviceError) throw new Error(deviceError.message)
      if (!device) throw new Error('메인 PC가 오프라인입니다. Companion을 실행해 주세요.')

      const { data: job, error: jobError } = await database
        .from('local_jobs')
        .insert({
          user_id: user.id,
          device_id: device.id,
          job_type: 'sermon',
          payload: { research: body.research },
        })
        .select('id,status')
        .single()
      if (jobError) throw new Error(jobError.message)
      return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
    }

    // 설교 생성 모듈은 E5·Claude 실행 체인을 포함하므로 로컬 분기에서만 lazy import한다.
    const { createSermonDraft } = await import('@/lib/sermon/generate')
    const { attachObsidianExport } = await import('@/lib/sermon/obsidian-export')
    const { readLocalSettings } = await import('@/lib/local-settings')
    const env = getServerEnv()
    const draft = await createSermonDraft({
      database: createAdminClient(),
      userId: user.id,
      model: env.anthropicModel,
      research: body.research,
    })
    const settings = await readLocalSettings()
    const result = await attachObsidianExport(draft, settings.outputFolder)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '설교를 생성하지 못했습니다.'
    const clientError = /필요|올바르|아닙니다|비어|초과|중복|형식|부족|찾지 못했습니다|이어야|여야/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
