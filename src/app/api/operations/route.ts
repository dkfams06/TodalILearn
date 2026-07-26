import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import type {
  CompanionDevice,
  LocalJobStatus,
  LocalJobSummary,
  LocalJobType,
  OperationsSnapshot,
} from '@/lib/execution/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY_COUNTS: Record<LocalJobStatus, number> = {
  queued: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    const database = createAdminClient()
    const [deviceResult, jobResult] = await Promise.all([
      database
        .from('local_devices')
        .select('id,device_name,vault_id,last_seen_at,capabilities,companion_version')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('last_seen_at', { ascending: false, nullsFirst: false }),
      database
        .from('local_jobs')
        .select('id,device_id,job_type,status,attempt_count,error_message,created_at,updated_at,completed_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (deviceResult.error) throw new Error(deviceResult.error.message)
    if (jobResult.error) throw new Error(jobResult.error.message)

    const onlineThreshold = Date.now() - 45_000
    const devices: CompanionDevice[] = (deviceResult.data ?? []).map((device) => ({
      id: device.id,
      deviceName: device.device_name,
      vaultId: device.vault_id,
      lastSeenAt: device.last_seen_at,
      online: device.last_seen_at
        ? new Date(device.last_seen_at).getTime() >= onlineThreshold
        : false,
      capabilities: Array.isArray(device.capabilities)
        ? device.capabilities.filter((item): item is string => typeof item === 'string')
        : [],
      companionVersion: device.companion_version,
    }))
    const jobs: LocalJobSummary[] = (jobResult.data ?? []).map((job) => ({
      id: job.id,
      deviceId: job.device_id,
      jobType: job.job_type as LocalJobType,
      status: job.status as LocalJobStatus,
      attemptCount: job.attempt_count,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    }))
    const counts = jobs.reduce<Record<LocalJobStatus, number>>(
      (summary, job) => ({ ...summary, [job.status]: summary[job.status] + 1 }),
      { ...EMPTY_COUNTS },
    )
    const snapshot: OperationsSnapshot = {
      generatedAt: new Date().toISOString(),
      devices,
      jobs,
      counts,
    }
    return NextResponse.json(snapshot)
  } catch (error) {
    const message = error instanceof Error ? error.message : '운영 상태를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
