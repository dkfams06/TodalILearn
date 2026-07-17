import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import {
  readLocalSettings,
  writeLocalSettings,
  type LocalSettings,
} from '@/lib/local-settings'

export async function GET() {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  return NextResponse.json(await readLocalSettings())
}

export async function PUT(request: Request) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const settings = (await request.json()) as LocalSettings
    await writeLocalSettings(settings)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '로컬 설정을 저장하지 못했습니다.' },
      { status: 400 },
    )
  }
}

