import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { adoptLocalConflict } from '@/lib/sermon/sync-store'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// 충돌 해결: 로컬 파일 내용(conflict_backup)을 새 대표 버전으로 승격한다.
// 순수 DB 작업이라 로컬·웹 모드 구분 없이 즉시 실행한다. "서버 버전 유지"는 이 라우트를 쓰지 않고
// 기존 /api/sermons/[id]/export를 그대로 호출한다(대표 버전 계산이 conflict_backup을 건너뛴다).
export async function POST(_request: Request, context: RouteContext<'/api/sermons/[id]/sync/resolve'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const admin = createAdminClient()

    const { data: sermon, error: sermonError } = await admin
      .from('sermons')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (sermonError) throw new Error(sermonError.message)
    if (!sermon) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    const result = await adoptLocalConflict(admin, { sermonId: id, userId: user.id })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '충돌을 해결하지 못했습니다.'
    const clientError = /필요|올바르|아닙니다|비어|초과|중복|형식|부족|찾지 못했습니다|이어야|여야/.test(message)
    return NextResponse.json({ error: message }, { status: clientError ? 400 : 500 })
  }
}
