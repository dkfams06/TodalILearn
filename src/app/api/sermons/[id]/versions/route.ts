import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { parseVersionInputForSave } from '@/lib/sermon/persist'
import type { SermonDraft } from '@/lib/sermon/types'
import { ensureVersions, insertVersion, listVersions, nextVersionNumber } from '@/lib/sermon/version-store'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type OwnedSermon = { id: string; draft: SermonDraft; created_at: string }

async function loadOwnedSermon(admin: ReturnType<typeof createAdminClient>, id: string, userId: string) {
  const { data, error } = await admin
    .from('sermons')
    .select('id,draft,created_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as OwnedSermon | null) ?? null
}

export async function GET(_request: Request, context: RouteContext<'/api/sermons/[id]/versions'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const admin = createAdminClient()
    const sermon = await loadOwnedSermon(admin, id, user.id)
    if (!sermon) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    const versions = await ensureVersions(admin, {
      sermonId: sermon.id,
      userId: user.id,
      draft: sermon.draft,
      createdAt: new Date(sermon.created_at),
    })
    return NextResponse.json({ versions })
  } catch (error) {
    const message = error instanceof Error ? error.message : '버전을 불러오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, context: RouteContext<'/api/sermons/[id]/versions'>) {
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
      input = parseVersionInputForSave(body)
    } catch (error) {
      const message = error instanceof Error ? error.message : '버전 데이터가 올바르지 않습니다.'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const admin = createAdminClient()
    const sermon = await loadOwnedSermon(admin, id, user.id)
    if (!sermon) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    // 편집본을 저장하기 전에 레거시 설교의 버전 1을 보장한다.
    await ensureVersions(admin, {
      sermonId: sermon.id,
      userId: user.id,
      draft: sermon.draft,
      createdAt: new Date(sermon.created_at),
    })

    const versionNumber = await nextVersionNumber(admin, sermon.id)
    const version = await insertVersion(admin, {
      sermonId: sermon.id,
      userId: user.id,
      versionNumber,
      source: input.source,
      content: input.content,
      editReasons: input.editReasons,
      note: input.note,
    })

    const versions = await listVersions(admin, sermon.id)
    return NextResponse.json({ version, versions }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '버전을 저장하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
