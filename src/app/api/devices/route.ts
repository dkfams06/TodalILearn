import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import { getExecutionMode } from '@/lib/execution/mode'
import type { CompanionDevice } from '@/lib/execution/types'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET() {
  const mode = getExecutionMode()
  if (mode === 'local') return NextResponse.json({ mode, devices: [] })

  try {
    const user = await getCurrentUser()
    const { data, error } = await createAdminClient()
      .from('local_devices')
      .select('id,device_name,vault_id,last_seen_at,capabilities,companion_version')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false, nullsFirst: false })

    if (error) throw new Error(error.message)
    const onlineThreshold = Date.now() - 45_000
    const devices: CompanionDevice[] = (data ?? []).map((device) => ({
      id: device.id,
      deviceName: device.device_name,
      vaultId: device.vault_id,
      lastSeenAt: device.last_seen_at,
      capabilities: Array.isArray(device.capabilities)
        ? device.capabilities.filter((item): item is string => typeof item === 'string')
        : [],
      companionVersion: device.companion_version,
      online: device.last_seen_at
        ? new Date(device.last_seen_at).getTime() >= onlineThreshold
        : false,
    }))
    return NextResponse.json({ mode, devices })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Companion 상태를 확인하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
