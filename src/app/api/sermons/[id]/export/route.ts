import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getExecutionMode } from '@/lib/execution/mode'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

// 완성 설교(최신 버전)를 옵시디언 출력 폴더에 저장한다.
// 로컬 런타임은 즉시 실행하고, 웹 모드는 메인 PC Companion에 작업을 등록한다.
export async function POST(_request: Request, context: RouteContext<'/api/sermons/[id]/export'>) {
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
          job_type: 'sermon_export',
          payload: { sermonId: id },
        })
        .select('id,status')
        .single()
      if (jobError) throw new Error(jobError.message)
      return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 })
    }

    const { exportSermon } = await import('@/lib/sermon/export-store')
    const { readLocalSettings } = await import('@/lib/local-settings')
    const settings = await readLocalSettings()
    const result = await exportSermon(admin, {
      sermonId: id,
      userId: user.id,
      outputFolder: settings.outputFolder,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '옵시디언에 저장하지 못했습니다.'
    const clientError = /필요|올바르|아닙니다|비어|초과|중복|형식|부족|찾지 못했습니다|이어야|여야|오프라인/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
