import path from 'node:path'

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase URL과 service role key가 필요합니다.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const expectedTables = [
  'obsidian_devices',
  'obsidian_sources',
  'knowledge_resources',
  'knowledge_chunks',
  'family_worship_sermons',
  'sermon_versions',
]

let failed = false

for (const table of expectedTables) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (error) {
    failed = true
    console.error(`${table}: ERROR ${error.message}`)
  } else {
    console.log(`${table}: OK (${count ?? 0} rows)`)
  }
}

const { count: sopCount, error: sopError } = await supabase
  .from('sop_chunks')
  .select('*', { count: 'exact', head: true })

if (sopError) {
  failed = true
  console.error(`sop_chunks: ERROR ${sopError.message}`)
} else {
  console.log(`sop_chunks preserved: OK (${sopCount ?? 0} rows)`)
}

if (failed) process.exit(1)

