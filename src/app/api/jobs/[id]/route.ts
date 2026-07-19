import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import type { ResearchJobResponse } from '@/lib/execution/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: RouteContext<'/api/jobs/[id]'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const { data, error } = await createAdminClient()
      .from('local_jobs')
      .select('id,status,result,error_message')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: '작업을 찾지 못했습니다.' }, { status: 404 })

    const response: ResearchJobResponse = {
      jobId: data.id,
      status: data.status,
      ...(data.result ? { result: data.result } : {}),
      ...(data.error_message ? { error: data.error_message } : {}),
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : '작업 상태를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
