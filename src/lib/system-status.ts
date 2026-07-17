import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getServerEnv } from '@/lib/env/server'

export type SystemStatus = {
  environment: 'ok' | 'error'
  supabase: 'ok' | 'error'
  sopChunkCount: number | null
  anthropicModel: string | null
  message: string | null
}

export async function getSystemStatus(): Promise<SystemStatus> {
  try {
    const env = getServerEnv()
    const admin = createAdminClient()
    const { count, error } = await admin
      .from('sop_chunks')
      .select('*', { count: 'exact', head: true })

    if (error) {
      return {
        environment: 'ok',
        supabase: 'error',
        sopChunkCount: null,
        anthropicModel: env.anthropicModel,
        message: 'Supabase 상태를 확인하지 못했습니다.',
      }
    }

    return {
      environment: 'ok',
      supabase: 'ok',
      sopChunkCount: count,
      anthropicModel: env.anthropicModel,
      message: null,
    }
  } catch {
    return {
      environment: 'error',
      supabase: 'error',
      sopChunkCount: null,
      anthropicModel: null,
      message: '필수 환경변수가 올바르게 설정되지 않았습니다.',
    }
  }
}

