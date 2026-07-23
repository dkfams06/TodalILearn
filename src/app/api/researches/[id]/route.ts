import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getSavedResearch } from '@/lib/research/store'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const { id } = await context.params
    const saved = await getSavedResearch(createAdminClient(), user.id, id)
    if (!saved) return NextResponse.json({ error: '저장된 연구를 찾지 못했습니다.' }, { status: 404 })
    return NextResponse.json(saved)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장된 연구를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
