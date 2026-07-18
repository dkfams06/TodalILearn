import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { chunkMarkdown } from '../src/lib/knowledge/chunk-markdown'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const embeddingVersion = 1

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 환경변수가 필요합니다.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sources, error: sourcesError } = await supabase
    .from('obsidian_sources')
    .select('id,relative_path,raw_markdown,content_hash')
    .eq('source_deleted', false)
    .order('relative_path')
  if (sourcesError) throw sourcesError

  let processed = 0
  let skipped = 0
  let chunkCount = 0

  for (const source of sources) {
    const { data: existingResource, error: resourceReadError } = await supabase
      .from('knowledge_resources')
      .select('id,source_content_hash')
      .eq('source_id', source.id)
      .maybeSingle()
    if (resourceReadError) throw resourceReadError

    let resourceId = existingResource?.id as string | undefined
    if (!resourceId) {
      const { data: created, error } = await supabase
        .from('knowledge_resources')
        .insert({
          source_id: source.id,
          source_content_hash: source.content_hash,
          analysis_status: 'pending',
        })
        .select('id')
        .single()
      if (error) throw error
      resourceId = created.id
    }

    if (existingResource?.source_content_hash === source.content_hash) {
      const { count, error } = await supabase
        .from('knowledge_chunks')
        .select('id', { count: 'exact' })
        .eq('source_id', source.id)
        .eq('embedding_version', embeddingVersion)
        .limit(1)
      if (error) throw error
      if ((count ?? 0) > 0) {
        skipped += 1
        continue
      }
    }

    const chunks = chunkMarkdown(source.raw_markdown)
    if (chunks.length === 0) throw new Error(`청크가 생성되지 않았습니다: ${source.relative_path}`)

    const payload = chunks.map((chunk) => ({
      source_id: source.id,
      resource_id: resourceId,
      chunk_index: chunk.chunkIndex,
      section_name: chunk.sectionName,
      content: chunk.content,
      content_start_offset: chunk.contentStartOffset,
      content_end_offset: chunk.contentEndOffset,
      token_count: null,
      embedding: null,
      embedding_model: null,
      embedding_revision: null,
      embedding_version: embeddingVersion,
      metadata: { source_content_hash: source.content_hash },
    }))

    const { error: upsertError } = await supabase
      .from('knowledge_chunks')
      .upsert(payload, { onConflict: 'source_id,chunk_index,embedding_version' })
    if (upsertError) throw upsertError

    const { error: staleError } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('source_id', source.id)
      .eq('embedding_version', embeddingVersion)
      .gte('chunk_index', chunks.length)
    if (staleError) throw staleError

    const { error: resourceUpdateError } = await supabase
      .from('knowledge_resources')
      .update({ source_content_hash: source.content_hash })
      .eq('id', resourceId)
    if (resourceUpdateError) throw resourceUpdateError

    processed += 1
    chunkCount += chunks.length
    console.log(`${source.relative_path}: ${chunks.length}개 청크`)
  }

  console.log(JSON.stringify({ documents: sources.length, processed, skipped, chunks: chunkCount }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
