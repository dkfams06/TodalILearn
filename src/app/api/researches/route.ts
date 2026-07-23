import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { listSavedResearch, saveResearchBundle } from '@/lib/research/store'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    return NextResponse.json({ researches: await listSavedResearch(createAdminClient(), user.id) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장된 연구를 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    const body = await request.json() as { bundle?: unknown }
    const saved = await saveResearchBundle(createAdminClient(), user.id, body.bundle)
    return NextResponse.json(saved, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '연구 묶음을 저장하지 못했습니다.'
    const clientError = /필요|올바르지|초과/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
