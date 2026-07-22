import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { parseSermonDraftForSave } from '@/lib/sermon/persist'
import type { SavedSermonSummary } from '@/lib/sermon/types'
import { createInitialVersion } from '@/lib/sermon/version-store'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const SERMON_SUMMARY_COLUMNS = 'id,title,query,core_message,estimated_minutes,total_chars,is_baseline,created_at'

type SermonRow = {
  id: string
  title: string
  query: string
  core_message: string
  estimated_minutes: number
  total_chars: number
  is_baseline: boolean
  created_at: string
}

function toSummary(row: SermonRow): SavedSermonSummary {
  return {
    id: row.id,
    title: row.title,
    query: row.query,
    coreMessage: row.core_message,
    estimatedMinutes: row.estimated_minutes,
    totalChars: row.total_chars,
    isBaseline: row.is_baseline,
    createdAt: row.created_at,
  }
}

export async function GET() {
  let user: Awaited<ReturnType<typeof getCurrentUser>>
  try {
    user = await getCurrentUser()
  } catch (error) {
    const message = error instanceof Error ? error.message : '사용자를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const { data, error } = await createAdminClient()
    .from('sermons')
    .select(SERMON_SUMMARY_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sermons: (data as SermonRow[] | null ?? []).map(toSummary) })
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getCurrentUser>>
  try {
    user = await getCurrentUser()
  } catch (error) {
    const message = error instanceof Error ? error.message : '사용자를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  let body: { draft?: unknown }
  try {
    body = await request.json() as { draft?: unknown }
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
  }

  let draft
  try {
    draft = parseSermonDraftForSave(body.draft)
  } catch (error) {
    const message = error instanceof Error ? error.message : '설교 데이터가 올바르지 않습니다.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sermons')
    .insert({
      user_id: user.id,
      title: draft.title,
      query: draft.query,
      core_message: draft.coreMessage,
      estimated_minutes: draft.estimatedMinutes,
      total_chars: draft.totalChars,
      draft,
    })
    .select(SERMON_SUMMARY_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const summary = toSummary(data as SermonRow)
  // 저장과 동시에 버전 1(AI 생성본)을 남겨 이후 편집·diff의 기준점으로 삼는다.
  try {
    await createInitialVersion(admin, { sermonId: summary.id, userId: user.id, draft })
  } catch (versionError) {
    const message = versionError instanceof Error ? versionError.message : '초기 버전을 저장하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json(summary, { status: 201 })
}
