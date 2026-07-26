import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { canRetryJob } from '@/lib/execution/job-utils'
import type { LocalJobStatus } from '@/lib/execution/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const database = createAdminClient()
    const { data: job, error: jobError } = await database
      .from('local_jobs')
      .select('id,device_id,status')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (jobError) throw new Error(jobError.message)
    if (!job) return NextResponse.json({ error: '작업을 찾지 못했습니다.' }, { status: 404 })
    if (!canRetryJob(job.status as LocalJobStatus)) {
      return NextResponse.json(
        { error: '실패하거나 취소된 작업만 다시 시도할 수 있습니다.' },
        { status: 409 },
      )
    }

    const { data: device, error: deviceError } = await database
      .from('local_devices')
      .select('last_seen_at')
      .eq('id', job.device_id)
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle()

    if (deviceError) throw new Error(deviceError.message)
    const deviceOnline = device?.last_seen_at
      ? new Date(device.last_seen_at).getTime() >= Date.now() - 45_000
      : false
    if (!deviceOnline) {
      return NextResponse.json(
        { error: '메인 PC가 오프라인입니다. Companion을 실행한 뒤 다시 시도해 주세요.' },
        { status: 409 },
      )
    }

    const now = new Date().toISOString()
    const { data: retriedJob, error: retryError } = await database
      .from('local_jobs')
      .update({
        status: 'queued',
        result: null,
        error_code: null,
        error_message: null,
        claimed_at: null,
        heartbeat_at: null,
        completed_at: null,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .in('status', ['failed', 'cancelled'])
      .select('id,status')
      .maybeSingle()

    if (retryError) throw new Error(retryError.message)
    if (!retriedJob) {
      return NextResponse.json(
        { error: '다른 요청이 작업 상태를 변경했습니다. 상태를 새로 고친 뒤 확인해 주세요.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ jobId: retriedJob.id, status: retriedJob.status }, { status: 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '작업을 다시 시도하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
