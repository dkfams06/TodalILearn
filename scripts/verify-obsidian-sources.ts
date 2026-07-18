import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import type { LocalSettings } from '../src/lib/local-settings'
import { discoverMarkdownFiles, readMarkdownFile } from '../src/lib/obsidian/files'

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
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 2,
  })
  if (usersError) throw usersError
  if (users.users.length !== 1) throw new Error('검증 대상 사용자가 정확히 한 명이어야 합니다.')

  const userId = users.users[0].id
  const files = await discoverMarkdownFiles(settings.inputFolder)
  const { data: rows, error } = await supabase
    .from('obsidian_sources')
    .select('relative_path,raw_markdown,content_hash,frontmatter,sync_status,sync_error,source_deleted')
    .eq('user_id', userId)
    .eq('vault_id', settings.vaultId)

  if (error) throw error
  assert.equal(rows.length, files.length)
  const rowsByPath = new Map(rows.map((row) => [row.relative_path, row]))

  for (const file of files) {
    const local = await readMarkdownFile(file)
    const remote = rowsByPath.get(file.relativePath)
    assert.ok(remote, `DB에 없는 파일: ${file.relativePath}`)
    assert.equal(remote.content_hash, local.contentHash)
    assert.equal(remote.raw_markdown, local.rawMarkdown)
    assert.equal(remote.source_deleted, false)
    assert.equal(remote.sync_error, null)
    assert.ok(remote.frontmatter && typeof remote.frontmatter === 'object')
  }

  console.log(`실제 옵시디언 문서 ${files.length}개의 원문·해시·상태가 모두 일치합니다.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
