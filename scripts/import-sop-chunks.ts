import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const expectedCount = 5_857
const pageSize = 500

type SourceRow = {
  id: string
  book: string
  chapter: number
  title: string
  chunk_index: number
  content: string
  created_at: string
}

type TargetRow = Omit<SourceRow, 'created_at'> & {
  content_hash: string
  source_created_at: string
}

async function readEnvironment(filePath: string) {
  return dotenv.parse(await readFile(filePath, 'utf8'))
}

async function fetchRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if ((data?.length ?? 0) < pageSize) return rows
  }
}

function rowHash(
  row: Pick<TargetRow, 'id' | 'book' | 'chapter' | 'title' | 'chunk_index' | 'content'>,
) {
  return createHash('sha256')
    .update([row.id, row.book, row.chapter, row.title, row.chunk_index, row.content].join('\u0000'))
    .digest('hex')
}

function collectionHash(
  rows: Array<Pick<TargetRow, 'id' | 'book' | 'chapter' | 'title' | 'chunk_index' | 'content'>>,
) {
  const hash = createHash('sha256')
  for (const row of rows) hash.update(rowHash(row))
  return hash.digest('hex')
}

async function main() {
  const sourceEnv = await readEnvironment('C:/Users/EQR6/Downloads/claude/manna/.env.local')
  const targetEnv = await readEnvironment(path.join(process.cwd(), '.env.local'))
  const source = createClient(
    sourceEnv.NEXT_PUBLIC_SUPABASE_URL,
    sourceEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const target = createClient(
    targetEnv.NEXT_PUBLIC_SUPABASE_URL,
    targetEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const sourceRows = await fetchRows<SourceRow>(
    source,
    'sop_chunks',
    'id,book,chapter,title,chunk_index,content,created_at',
  )
  if (sourceRows.length !== expectedCount) {
    throw new Error(`만나앱 원본은 ${expectedCount}개여야 하지만 ${sourceRows.length}개입니다.`)
  }

  const targetRows: TargetRow[] = sourceRows.map((row) => ({
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    title: row.title,
    chunk_index: row.chunk_index,
    content: row.content,
    content_hash: createHash('sha256').update(row.content).digest('hex'),
    source_created_at: row.created_at,
  }))

  for (let offset = 0; offset < targetRows.length; offset += pageSize) {
    const batch = targetRows.slice(offset, offset + pageSize)
    const { error } = await target.from('sop_chunks').upsert(batch, { onConflict: 'id' })
    if (error) throw error
    console.log(`sop_chunks 이전: ${Math.min(offset + batch.length, targetRows.length)}/${targetRows.length}`)
  }

  const importedRows = await fetchRows<TargetRow>(
    target,
    'sop_chunks',
    'id,book,chapter,title,chunk_index,content,content_hash,source_created_at',
  )
  if (importedRows.length !== expectedCount) {
    throw new Error(`새 프로젝트 대상은 ${expectedCount}개여야 하지만 ${importedRows.length}개입니다.`)
  }

  if (collectionHash(targetRows) !== collectionHash(importedRows)) {
    throw new Error('원본과 대상의 정렬된 내용 해시가 다릅니다.')
  }

  const invalidContentHashes = importedRows.filter(
    (row) => row.content_hash !== createHash('sha256').update(row.content).digest('hex'),
  ).length
  if (invalidContentHashes > 0) {
    throw new Error(`대상 content_hash 불일치: ${invalidContentHashes}개`)
  }

  console.log(`sop_chunks ${expectedCount}개 이전과 전체 내용 해시 검증을 완료했습니다.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
