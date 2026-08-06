import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { listMessages } from '@/lib/chat/store'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_request: Request, context: RouteContext<'/api/chat/conversations/[id]'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    const messages = await listMessages(createAdminClient(), user.id, id)
    return NextResponse.json({ messages })
  } catch (error) {
    const message = error instanceof Error ? error.message : '대화를 불러오지 못했습니다.'
    const status = message.includes('찾지 못했습니다') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
