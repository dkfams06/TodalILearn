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
  'sop_chunks',
  'sop_chunk_embeddings',
  'family_worship_sermons',
  'sermons',
  'sermon_versions',
  'sermon_evaluations',
  'research_bundles',
]

let failed = false

for (const table of expectedTables) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact' })
    .limit(1)

  if (error) {
    failed = true
    console.error(`${table}: ERROR ${error.message}`)
  } else {
    console.log(`${table}: OK (${count ?? 0} rows)`)
  }
}

const { error: sourceMetadataError } = await supabase
  .from('obsidian_sources')
  .select('id,frontmatter,sync_error')
  .limit(1)

if (sourceMetadataError) {
  failed = true
  console.error(`obsidian_sources Sprint 2 columns: ERROR ${sourceMetadataError.message}`)
} else {
  console.log('obsidian_sources Sprint 2 columns: OK')
}

const { error: resourceMetadataError } = await supabase
  .from('knowledge_resources')
  .select(
    'id,source_content_hash,analysis_provider,analysis_input_tokens,analysis_output_tokens,analysis_error,analyzed_at',
  )
  .limit(1)

if (resourceMetadataError) {
  failed = true
  console.error(`knowledge_resources Sprint 3 columns: ERROR ${resourceMetadataError.message}`)
} else {
  console.log('knowledge_resources Sprint 3 columns: OK')
}

const { error: sermonMetadataError } = await supabase
  .from('sermons')
  .select('id,is_baseline,obsidian_relative_path,obsidian_synced_at,obsidian_content_hash')
  .limit(1)

if (sermonMetadataError) {
  failed = true
  console.error(`sermons Sprint 7-9 columns: ERROR ${sermonMetadataError.message}`)
} else {
  console.log('sermons Sprint 7-9 columns: OK')
}

const { error: sermonVersionMetadataError } = await supabase
  .from('sermon_versions')
  .select('id,sermon_id,user_id,version_number,source,content,content_hash,edit_reasons,note,created_at')
  .limit(1)

if (sermonVersionMetadataError) {
  failed = true
  console.error(`sermon_versions Sprint 7-9 columns: ERROR ${sermonVersionMetadataError.message}`)
} else {
  console.log('sermon_versions Sprint 7-9 columns: OK')
}

const { data: providerRows, error: providerError } = await supabase
  .from('knowledge_resources')
  .select('analysis_provider')

if (providerError) {
  failed = true
  console.error(`knowledge_resources analysis providers: ERROR ${providerError.message}`)
} else {
  const providerCounts = (providerRows ?? []).reduce((counts, row) => {
    const provider = row.analysis_provider ?? 'unassigned'
    counts[provider] = (counts[provider] ?? 0) + 1
    return counts
  }, {})
  console.log(`knowledge_resources analysis providers: OK ${JSON.stringify(providerCounts)}`)
}

const { count: sopCount, error: sopError } = await supabase
  .from('sop_chunks')
  .select('id', { count: 'exact' })
  .limit(1)

if (sopError) {
  failed = true
  console.error(`sop_chunks: ERROR ${sopError.message}`)
} else {
  console.log(`sop_chunks import state: OK (${sopCount ?? 0} rows)`)
}

if (failed) process.exit(1)
