import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getExecutionMode } from '@/lib/execution/mode'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// 옵시디언 파일과 서버 대표 버전을 비교해 한쪽만 바뀌었으면 다른 쪽에 반영하고,
// 둘 다 바뀌었으면 감지·백업만 하고 사용자의 선택을 기다린다.
// 로컬 런타임은 즉시 실행하고, 웹 모드는 메인 PC Companion에 작업을 등록한다.
export async function POST(_request: Request, context: RouteContext<'/api/sermons/[id]/sync'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const admin = createAdminClient()

    const { data: sermon, error: sermonError } = await admin
      .from('sermons')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (sermonError) throw new Error(sermonError.message)
    if (!sermon) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    if (getExecutionMode() === 'web') {
      const onlineAfter = new Date(Date.now() - 45_000).toISOString()
      const { data: device, error: deviceError } = await admin
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

      const { data: job, error: jobError } = await admin
        .from('local_jobs')
        .insert({
          user_id: user.id,
          device_id: device.id,
          job_type: 'sermon_sync',
          payload: { sermonId: id },
        })
        .select('id,status')
        .single()
      if (jobError) throw new Error(jobError.message)
      return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
    }

    const { checkSermonSync } = await import('@/lib/sermon/sync-store')
    const { readLocalSettings } = await import('@/lib/local-settings')
    const settings = await readLocalSettings()
    const result = await checkSermonSync(admin, {
      sermonId: id,
      userId: user.id,
      outputFolder: settings.outputFolder,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '옵시디언 변경사항을 확인하지 못했습니다.'
    const clientError = /필요|올바르|아닙니다|비어|초과|중복|형식|부족|찾지 못했습니다|이어야|여야|오프라인|저장되지 않았습니다/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
