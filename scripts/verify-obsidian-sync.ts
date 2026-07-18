import assert from 'node:assert/strict'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { syncObsidianSources } from '../src/lib/obsidian/sync'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

async function main() {
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 2,
})
if (usersError) throw usersError
if (usersData.users.length !== 1) throw new Error('통합 테스트에는 정확히 한 명의 사용자가 필요합니다.')

const root = await mkdtemp(path.join(tmpdir(), 'bible-study-sync-'))
const vaultId = `sprint-2-verification-${Date.now()}`
const settings = {
  deviceName: 'Sprint 2 Verification',
  vaultId,
  inputFolder: root,
  outputFolder: root,
}
const userId = usersData.users[0].id
const validAPath = path.join(root, 'a.md')
const validBPath = path.join(root, 'b.md')
const invalidPath = path.join(root, 'broken.md')

try {
  await writeFile(validAPath, '---\ntitle: A\npublished: 2026-07-18\n---\nA', 'utf8')
  await writeFile(validBPath, '---\ntitle: B\n---\nB', 'utf8')
  await writeFile(invalidPath, '---\ntitle: [broken\n---\nbad', 'utf8')

  const first = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(first.created, 2)
  assert.equal(first.failed, 1)

  const second = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(second.unchanged, 2)
  assert.equal(second.failed, 1)
  assert.equal(second.created + second.updated + second.deleted + second.restored, 0)

  await writeFile(validAPath, '---\ntitle: A\npublished: 2026-07-18\n---\nA 수정', 'utf8')
  const modified = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(modified.updated, 1)
  assert.equal(modified.unchanged, 1)

  await unlink(validBPath)
  const deleted = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(deleted.deleted, 1)

  await writeFile(validBPath, '---\ntitle: B\n---\nB', 'utf8')
  const restored = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(restored.restored, 1)

  await writeFile(invalidPath, '---\ntitle: 고침\n---\n정상', 'utf8')
  const fixed = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(fixed.updated, 1)
  assert.equal(fixed.failed, 0)

  const stable = await syncObsidianSources({ userId, settings, supabase })
  assert.equal(stable.unchanged, 3)
  assert.equal(stable.created + stable.updated + stable.deleted + stable.restored + stable.failed, 0)

  console.log('Sprint 2 임시 Vault 통합 테스트를 통과했습니다.')
} finally {
  await supabase.from('obsidian_sources').delete().eq('user_id', userId).eq('vault_id', vaultId)
  await supabase.from('obsidian_devices').delete().eq('user_id', userId).eq('vault_id', vaultId)
  await rm(root, { recursive: true, force: true })
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
