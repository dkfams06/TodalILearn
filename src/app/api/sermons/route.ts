import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { parseSermonDraftForSave } from '@/lib/sermon/persist'
import type { SavedSermonSummary } from '@/lib/sermon/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type SermonRow = {
  id: string
  title: string
  query: string
  core_message: string
  estimated_minutes: number
  total_chars: number
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
    .select('id,title,query,core_message,estimated_minutes,total_chars,created_at')
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

  const { data, error } = await createAdminClient()
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
    .select('id,title,query,core_message,estimated_minutes,total_chars,created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(toSummary(data as SermonRow), { status: 201 })
}
