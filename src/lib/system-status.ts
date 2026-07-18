import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getServerEnv } from '@/lib/env/server'

export type SystemStatus = {
  environment: 'ok' | 'error'
  supabase: 'ok' | 'error'
  sopChunkStatus: 'ready' | 'pending' | 'error'
  sopChunkCount: number | null
  claudeModel: string | null
  claudeSubscription: 'configured' | 'error'
  claudeSubscriptionLabel: string | null
  message: string | null
}

export async function getSystemStatus(): Promise<SystemStatus> {
  try {
    const env = getServerEnv()
    const admin = createAdminClient()
    const { count, error } = await admin
      .from('sop_chunks')
      .select('id', { count: 'exact' })
      .limit(1)
    const claudeSubscription = 'configured' as const
    const claudeSubscriptionLabel = 'Claude Code 구독 (`claude -p`)'

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return {
          environment: 'ok',
          supabase: 'ok',
          sopChunkStatus: 'pending',
          sopChunkCount: null,
          claudeModel: env.anthropicModel,
          claudeSubscription,
          claudeSubscriptionLabel,
          message: null,
        }
      }

      return {
        environment: 'ok',
        supabase: 'error',
        sopChunkStatus: 'error',
        sopChunkCount: null,
        claudeModel: env.anthropicModel,
        claudeSubscription,
        claudeSubscriptionLabel,
        message: 'Supabase 상태를 확인하지 못했습니다.',
      }
    }

    return {
      environment: 'ok',
      supabase: 'ok',
      sopChunkStatus: 'ready',
      sopChunkCount: count,
      claudeModel: env.anthropicModel,
      claudeSubscription,
      claudeSubscriptionLabel,
      message: null,
    }
  } catch {
    return {
      environment: 'error',
      supabase: 'error',
      sopChunkStatus: 'error',
      sopChunkCount: null,
      claudeModel: null,
      claudeSubscription: 'error',
      claudeSubscriptionLabel: null,
      message: '필수 환경변수가 올바르게 설정되지 않았습니다.',
    }
  }
}
