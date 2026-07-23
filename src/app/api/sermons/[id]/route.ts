import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { listEvaluations } from '@/lib/sermon/evaluation-store'
import type { SavedSermon } from '@/lib/sermon/types'
import { ensureVersions } from '@/lib/sermon/version-store'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const SERMON_COLUMNS = 'id,title,query,core_message,estimated_minutes,total_chars,is_baseline,obsidian_relative_path,obsidian_synced_at,created_at,draft'

type SermonRow = {
  id: string
  title: string
  query: string
  core_message: string
  estimated_minutes: number
  total_chars: number
  is_baseline: boolean
  obsidian_relative_path: string | null
  obsidian_synced_at: string | null
  created_at: string
  draft: SavedSermon['draft']
}

export async function GET(_request: Request, context: RouteContext<'/api/sermons/[id]'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('sermons')
      .select(SERMON_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    const row = data as SermonRow
    // 마이그레이션 009 이전에 저장된 설교는 버전이 없으므로 draft로 버전 1을 지연 생성한다.
    const [versions, evaluations] = await Promise.all([
      ensureVersions(admin, {
        sermonId: row.id,
        userId: user.id,
        draft: row.draft,
        createdAt: new Date(row.created_at),
      }),
      listEvaluations(admin, row.id),
    ])
    const latestMarkdown = versions[versions.length - 1]?.content ?? ''

    const sermon: SavedSermon = {
      id: row.id,
      title: row.title,
      query: row.query,
      coreMessage: row.core_message,
      estimatedMinutes: row.estimated_minutes,
      totalChars: row.total_chars,
      isBaseline: row.is_baseline,
      obsidianRelativePath: row.obsidian_relative_path,
      obsidianSyncedAt: row.obsidian_synced_at,
      createdAt: row.created_at,
      draft: row.draft,
      latestMarkdown,
      versions,
      evaluations,
    }
    return NextResponse.json(sermon)
  } catch (error) {
    const message = error instanceof Error ? error.message : '설교를 불러오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 기준 설교(baseline) 표시 토글. 프롬프트 변경 전후 비교의 기준점을 지정한다.
export async function PATCH(request: Request, context: RouteContext<'/api/sermons/[id]'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])

    let body: { isBaseline?: unknown }
    try {
      body = await request.json() as { isBaseline?: unknown }
    } catch {
      return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 })
    }
    if (typeof body.isBaseline !== 'boolean') {
      return NextResponse.json({ error: 'isBaseline 값이 필요합니다.' }, { status: 400 })
    }

    const { data, error } = await createAdminClient()
      .from('sermons')
      .update({ is_baseline: body.isBaseline, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id,is_baseline')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    return NextResponse.json({ id: data.id, isBaseline: data.is_baseline })
  } catch (error) {
    const message = error instanceof Error ? error.message : '기준 설교 설정을 바꾸지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
