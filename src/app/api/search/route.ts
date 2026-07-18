import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { hybridSearch } from '@/lib/search/hybrid'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  let body: { query?: unknown }
  try {
    body = await request.json() as { query?: unknown }
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
  }
  if (typeof body.query !== 'string') {
    return NextResponse.json({ error: '검색어가 필요합니다.' }, { status: 400 })
  }

  try {
    const result = await hybridSearch({
      database: createAdminClient(),
      userId: user.id,
      query: body.query,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '검색하지 못했습니다.'
    const status = message.includes('검색어') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

