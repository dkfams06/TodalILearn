import { NextResponse } from 'next/server'

import {
  autoDetectLocalSettings,
  LocalSettingsUnavailableError,
  readLocalSettings,
  writeLocalSettings,
  type LocalSettings,
} from '@/lib/local-settings'

export const runtime = 'nodejs'

function settingsError(error: unknown) {
  const message = error instanceof Error ? error.message : '로컬 설정을 처리하지 못했습니다.'
  const status = error instanceof LocalSettingsUnavailableError ? 409 : 400
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    return NextResponse.json(await readLocalSettings())
  } catch (error) {
    return settingsError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const settings = (await request.json()) as LocalSettings
    await writeLocalSettings(settings)
    return NextResponse.json({ ok: true, settings: await readLocalSettings() })
  } catch (error) {
    return settingsError(error)
  }
}

export async function POST() {
  try {
    const settings = await autoDetectLocalSettings()
    return NextResponse.json({ ok: true, settings })
  } catch (error) {
    return settingsError(error)
  }
}
