import path from 'node:path'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import {
  E5_DTYPE,
  E5_EMBEDDING_VERSION,
  E5_MODEL_ID,
  E5_MODEL_REVISION,
  E5_PREPROCESSING,
  embedPassages,
} from '../src/lib/embeddings/e5'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const pageSize = 500
const embeddingBatchSize = 24

type KnowledgeChunk = {
  id: string
  content: string
  embedding_model: string | null
  embedding_revision: string | null
}

type SopChunk = { id: string; content: string }
type SopEmbedding = {
  chunk_id: string
  embedding_model: string
  embedding_revision: string
  embedding_version: number
}

async function fetchPages<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filter?: { column: string; value: string | number },
) {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select(columns).order(table === 'sop_chunks' ? 'id' : 'id')
    if (filter) query = query.eq(filter.column, filter.value)
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if ((data?.length ?? 0) < pageSize) return rows
  }
}

async function embedKnowledgeChunks(supabase: SupabaseClient) {
  const chunks = await fetchPages<KnowledgeChunk>(
    supabase,
    'knowledge_chunks',
    'id,content,embedding_model,embedding_revision',
    { column: 'embedding_version', value: E5_EMBEDDING_VERSION },
  )
  const pending = chunks.filter(
    (chunk) => chunk.embedding_model !== E5_MODEL_ID || chunk.embedding_revision !== E5_MODEL_REVISION,
  )

  for (let offset = 0; offset < pending.length; offset += embeddingBatchSize) {
    const batch = pending.slice(offset, offset + embeddingBatchSize)
    const vectors = await embedPassages(batch.map((chunk) => chunk.content))
    for (let index = 0; index < batch.length; index += 1) {
      const { error } = await supabase
        .from('knowledge_chunks')
        .update({
          embedding: vectors[index],
          embedding_model: E5_MODEL_ID,
          embedding_revision: E5_MODEL_REVISION,
        })
        .eq('id', batch[index].id)
      if (error) throw error
    }
    console.log(`옵시디언 임베딩: ${Math.min(offset + batch.length, pending.length)}/${pending.length}`)
  }

  return { total: chunks.length, embedded: pending.length, skipped: chunks.length - pending.length }
}

async function embedSopChunks(supabase: SupabaseClient) {
  const [chunks, existing] = await Promise.all([
    fetchPages<SopChunk>(supabase, 'sop_chunks', 'id,content'),
    fetchPages<SopEmbedding>(
      supabase,
      'sop_chunk_embeddings',
      'chunk_id,embedding_model,embedding_revision,embedding_version',
      { column: 'embedding_version', value: E5_EMBEDDING_VERSION },
    ),
  ])
  const validIds = new Set(
    existing
      .filter(
        (item) =>
          item.embedding_model === E5_MODEL_ID && item.embedding_revision === E5_MODEL_REVISION,
      )
      .map((item) => item.chunk_id),
  )
  const pending = chunks.filter((chunk) => !validIds.has(chunk.id))

  for (let offset = 0; offset < pending.length; offset += embeddingBatchSize) {
    const batch = pending.slice(offset, offset + embeddingBatchSize)
    const vectors = await embedPassages(batch.map((chunk) => chunk.content))
    const payload = batch.map((chunk, index) => ({
      chunk_id: chunk.id,
      embedding_version: E5_EMBEDDING_VERSION,
      embedding: vectors[index],
      embedding_model: E5_MODEL_ID,
      embedding_revision: E5_MODEL_REVISION,
      embedding_dtype: E5_DTYPE,
      preprocessing: E5_PREPROCESSING,
    }))
    const { error } = await supabase
      .from('sop_chunk_embeddings')
      .upsert(payload, { onConflict: 'chunk_id,embedding_version' })
    if (error) throw error
    console.log(`예언의 신 임베딩: ${Math.min(offset + batch.length, pending.length)}/${pending.length}`)
  }

  return { total: chunks.length, embedded: pending.length, skipped: chunks.length - pending.length }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const scope = process.argv.find((argument) => argument.startsWith('--scope='))?.split('=')[1] ?? 'all'
  const result: Record<string, unknown> = {}
  if (scope === 'all' || scope === 'knowledge') result.knowledge = await embedKnowledgeChunks(supabase)
  if (scope === 'all' || scope === 'sop') result.sop = await embedSopChunks(supabase)
  if (!['all', 'knowledge', 'sop'].includes(scope)) throw new Error(`알 수 없는 scope: ${scope}`)
  console.log(JSON.stringify(result))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
