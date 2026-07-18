import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import type { LocalSettings } from '../src/lib/local-settings'
import { syncObsidianSources } from '../src/lib/obsidian/sync'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

async function main() {
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')

const settings = JSON.parse(
  await readFile(path.join(process.cwd(), 'data', 'local-settings.json'), 'utf8'),
) as LocalSettings
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 2 })
if (error) throw error
if (data.users.length !== 1) throw new Error('동기화 대상 사용자가 정확히 한 명이어야 합니다.')

const result = await syncObsidianSources({
  userId: data.users[0].id,
  settings,
  supabase,
})

console.log(JSON.stringify(result, null, 2))
if (result.failed > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
