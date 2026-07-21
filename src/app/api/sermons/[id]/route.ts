import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import type { SavedSermon } from '@/lib/sermon/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: RouteContext<'/api/sermons/[id]'>) {
  try {
    const [{ id }, user] = await Promise.all([context.params, getCurrentUser()])
    const { data, error } = await createAdminClient()
      .from('sermons')
      .select('id,title,query,core_message,estimated_minutes,total_chars,created_at,draft')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: '설교를 찾지 못했습니다.' }, { status: 404 })

    const sermon: SavedSermon = {
      id: data.id,
      title: data.title,
      query: data.query,
      coreMessage: data.core_message,
      estimatedMinutes: data.estimated_minutes,
      totalChars: data.total_chars,
      createdAt: data.created_at,
      draft: data.draft,
    }
    return NextResponse.json(sermon)
  } catch (error) {
    const message = error instanceof Error ? error.message : '설교를 불러오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
