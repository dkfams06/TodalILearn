import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { readLocalSettings } from '@/lib/local-settings'
import { syncObsidianSources } from '@/lib/obsidian/sync-server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const settings = await readLocalSettings()
    const supabase = createAdminClient()
    const result = await syncObsidianSources({
      userId: user.id,
      settings,
      supabase,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '동기화하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
