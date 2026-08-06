import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import type { ChatSendMessageResponse } from '@/lib/chat/types'
import { requireConversation, insertUserMessage } from '@/lib/chat/store'
import { getExecutionMode } from '@/lib/execution/mode'
import { getServerEnv } from '@/lib/env/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

// 사용자 메시지는 임베딩·Claude 없이 즉시 저장한다. 답변 생성은 메인 PC에서만
// 가능한 임베딩·Claude 구독 호출이 필요하므로, 웹 모드는 local_jobs에 작업을 등록하고
// 로컬 모드는 바로 실행한다 (연구 묶음/설교 생성과 동일한 분기).
export async function POST(
  request: Request,
  context: RouteContext<'/api/chat/conversations/[id]/messages'>,
) {
  let userId: string
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    userId = user.id

    let body: { message?: unknown }
    try {
      body = await request.json() as { message?: unknown }
    } catch {
      return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
    }
    if (typeof body.message !== 'string') {
      return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 })
    }

    const admin = createAdminClient()
    await requireConversation(admin, userId, id)
    const userMessage = await insertUserMessage(admin, id, body.message)

    if (getExecutionMode() === 'web') {
      const onlineAfter = new Date(Date.now() - 45_000).toISOString()
      const { data: device, error: deviceError } = await admin
        .from('local_devices')
        .select('id')
        .eq('user_id', userId)
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
          user_id: userId,
          device_id: device.id,
          job_type: 'chat',
          payload: { conversationId: id, userMessageId: userMessage.id, message: userMessage.content },
        })
        .select('id')
        .single()
      if (jobError) throw new Error(jobError.message)

      const response: ChatSendMessageResponse = { userMessage, status: 'queued', jobId: job.id }
      return NextResponse.json(response, { status: 202 })
    }

    // E5 임베딩과 Claude 구독 호출을 포함하는 실제 실행 모듈은 웹 모드 서버리스에서
    // 로드할 수 없으므로 로컬 분기에서만 lazy import한다.
    const { answerChatMessage } = await import('@/lib/chat/chat')
    const env = getServerEnv()
    const assistantMessage = await answerChatMessage({
      database: admin,
      userId,
      model: env.anthropicModel,
      conversationId: id,
      userMessageId: userMessage.id,
      message: userMessage.content,
    })

    const response: ChatSendMessageResponse = { userMessage, status: 'succeeded', assistantMessage }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : '메시지를 보내지 못했습니다.'
    const clientError = /필요|올바르지|이하여야|찾지 못했습니다|오프라인/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
