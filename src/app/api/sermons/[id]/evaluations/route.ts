import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { parseEvaluationInput } from '@/lib/sermon/evaluation'
import { listEvaluations, toEvaluation, EVALUATION_COLUMNS } from '@/lib/sermon/evaluation-store'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function ownsSermon(admin: ReturnType<typeof createAdminClient>, id: string, userId: string) {
  const { data, error } = await admin
    .from('sermons')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function GET(_request: Request, context: RouteContext<'/api/sermons/[id]/evaluations'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const admin = createAdminClient()
    if (!(await ownsSermon(admin, id, user.id))) {
      return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })
    }
    return NextResponse.json({ evaluations: await listEvaluations(admin, id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : '평가를 불러오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, context: RouteContext<'/api/sermons/[id]/evaluations'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
    }

    let input
    try {
      input = parseEvaluationInput(body)
    } catch (error) {
      const message = error instanceof Error ? error.message : '평가 데이터가 올바르지 않습니다.'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!(await ownsSermon(admin, id, user.id))) {
      return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('sermon_evaluations')
      .insert({
        sermon_id: id,
        user_id: user.id,
        version_number: input.versionNumber,
        scores: input.scores,
        verdict: input.verdict,
        note: input.note,
      })
      .select(EVALUATION_COLUMNS)
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ evaluation: toEvaluation(data) }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '평가를 저장하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
