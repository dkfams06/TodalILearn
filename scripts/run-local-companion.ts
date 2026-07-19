import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

async function main() {
const { readLocalSettings } = await import('../src/lib/local-settings')
const { createResearchBundle } = await import('../src/lib/research/research')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5'
if (!url || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')

const database = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data: users, error: usersError } = await database.auth.admin.listUsers({ page: 1, perPage: 2 })
if (usersError) throw usersError
const configuredUserId = process.env.APP_OWNER_USER_ID?.trim()
const user = configuredUserId
  ? users.users.find((item) => item.id === configuredUserId)
  : users.users.length === 1 ? users.users[0] : null
if (!user) throw new Error('개인용 사용자를 결정하지 못했습니다. APP_OWNER_USER_ID를 확인해 주세요.')

const settings = await readLocalSettings()
const { data: device, error: deviceError } = await database
  .from('local_devices')
  .upsert({
    user_id: user.id,
    device_name: settings.deviceName,
    vault_id: settings.vaultId,
    capabilities: ['research', 'obsidian', 'e5', 'claude-code-subscription'],
    companion_version: '0.1.0',
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  }, { onConflict: 'user_id,device_name,vault_id' })
  .select('id')
  .single()
if (deviceError) throw deviceError

let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

console.log(`Local Companion 시작: ${settings.deviceName} (${device.id})`)
console.log(`Obsidian 입력: ${settings.inputFolder}`)

const staleHeartbeat = new Date(Date.now() - 45_000).toISOString()
const { error: recoveryError } = await database
  .from('local_jobs')
  .update({
    status: 'queued',
    claimed_at: null,
    heartbeat_at: null,
    updated_at: new Date().toISOString(),
  })
  .eq('device_id', device.id)
  .eq('status', 'running')
  .lt('heartbeat_at', staleHeartbeat)
if (recoveryError) throw recoveryError

while (!stopping) {
  await database.from('local_devices').update({
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', device.id).eq('user_id', user.id)

  const { data: jobs, error: claimError } = await database.rpc('claim_local_job', {
    requested_user_id: user.id,
    requested_device_id: device.id,
  })
  if (claimError) throw claimError

  const job = jobs?.[0]
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    continue
  }

  let heartbeat: ReturnType<typeof setInterval> | null = null
  try {
    heartbeat = setInterval(() => {
      void database.from('local_jobs').update({
        heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id).eq('device_id', device.id).eq('status', 'running')
    }, 10_000)
    if (job.job_type !== 'research') throw new Error(`지원하지 않는 작업: ${job.job_type}`)
    const payload = job.payload as {
      query?: unknown
      personalContext?: unknown
      selectedKnowledgeIds?: string[]
      selectedSopIds?: string[]
    }
    if (typeof payload.query !== 'string') throw new Error('연구 질문이 없습니다.')
    const result = await createResearchBundle({
      database,
      userId: user.id,
      model,
      query: payload.query,
      personalContext: typeof payload.personalContext === 'string' ? payload.personalContext : '',
      selectedKnowledgeIds: payload.selectedKnowledgeIds,
      selectedSopIds: payload.selectedSopIds,
    })
    await database.from('local_jobs').update({
      status: 'succeeded',
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('device_id', device.id)
    console.log(`작업 완료: ${job.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Companion 작업 실패'
    await database.from('local_jobs').update({
      status: 'failed',
      error_code: 'companion_error',
      error_message: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id).eq('device_id', device.id)
    console.error(`작업 실패: ${job.id} · ${message}`)
  } finally {
    if (heartbeat) clearInterval(heartbeat)
  }
}

console.log('Local Companion을 종료했습니다.')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
