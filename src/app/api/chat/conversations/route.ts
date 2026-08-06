import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { createConversation, listConversations } from '@/lib/chat/store'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const conversations = await listConversations(createAdminClient(), user.id)
    return NextResponse.json({ conversations })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '대화 목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const conversation = await createConversation(createAdminClient(), user.id)
    return NextResponse.json(conversation, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '새 대화를 만들지 못했습니다.' },
      { status: 500 },
    )
  }
}
