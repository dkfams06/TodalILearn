import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getExecutionMode } from '@/lib/execution/mode'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getCurrentUser>>
  try {
    user = await getCurrentUser()
  } catch (error) {
    const message = error instanceof Error ? error.message : '사용자를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
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

  if (getExecutionMode() === 'web') {
    return NextResponse.json(
      { error: '검색은 메인 PC(로컬 모드)에서만 실행됩니다. 웹에서는 연구 묶음 기능을 사용해 주세요.' },
      { status: 501 },
    )
  }

  try {
    // E5 임베딩 모듈은 웹 모드 서버리스에서 로드할 수 없으므로 로컬 분기에서만 lazy import한다.
    const { hybridSearch } = await import('@/lib/search/hybrid')
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
