import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')

  const database = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await database
    .from('local_devices')
    .select('id,device_name,vault_id,last_seen_at')
    .is('revoked_at', null)
  if (error) throw error
  if (!data || data.length === 0) throw new Error('등록된 Local Companion이 없습니다.')

  const onlineAfter = Date.now() - 45_000
  const online = data.filter(
    (device) => device.last_seen_at && new Date(device.last_seen_at).getTime() >= onlineAfter,
  )
  if (online.length === 0) throw new Error('온라인 Local Companion이 없습니다.')

  console.log(`등록 장치 ${data.length}개 · 온라인 ${online.length}개`)
  for (const device of online) {
    console.log(`${device.device_name} · ${device.vault_id}`)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
