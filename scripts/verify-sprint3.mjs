import path from 'node:path'

import dotenv from 'dotenv'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

const expected = {
  sources: 7,
  knowledgeChunks: 189,
  sopChunks: 5857,
  dimensions: 384,
  model: 'Xenova/multilingual-e5-small',
  revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  version: 1,
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const databaseUrl = process.env.SUPABASE_DATABASE_URL
const databasePassword = process.env.SUPABASE_DB_PASSWORD
if (!supabaseUrl || !serviceRoleKey || !databaseUrl || !databasePassword) {
  throw new Error('Sprint 3 검증에 필요한 환경변수가 없습니다.')
}

const encodedPassword = encodeURIComponent(databasePassword)
const normalizedDatabaseUrl = databaseUrl.replace(
  /^(postgres(?:ql)?:\/\/[^:]+:).*(?=@[^@/]+(?::\d+)?\/)/,
  `$1${encodedPassword}`,
)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function allRows(table, columns, configure) {
  const rows = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select(columns).order('id')
    if (configure) query = configure(query)
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) return rows
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validateEvidence(markdown, items, field, relativePath) {
  assert(Array.isArray(items), `${relativePath} ${field}가 배열이 아닙니다.`)
  for (const item of items) {
    assert(typeof item.evidence_quote === 'string', `${relativePath} ${field} 인용문 누락`)
    assert(
      markdown.slice(item.content_start_offset, item.content_end_offset) === item.evidence_quote,
      `${relativePath} ${field} 원문 offset 불일치`,
    )
  }
}

const [sources, resources, chunks, sopChunks, sopEmbeddings] = await Promise.all([
  allRows('obsidian_sources', 'id,relative_path,raw_markdown,content_hash', (query) =>
    query.eq('source_deleted', false)),
  allRows(
    'knowledge_resources',
    'id,source_id,source_content_hash,analysis_model,analysis_prompt_version,analysis_status,analysis_input_tokens,analysis_output_tokens,key_claims,illustrations,applications',
  ),
  allRows(
    'knowledge_chunks',
    'id,source_id,content,content_start_offset,content_end_offset,embedding_model,embedding_revision,embedding_version',
    (query) => query.eq('embedding_version', expected.version),
  ),
  allRows('sop_chunks', 'id'),
  allRows(
    'sop_chunk_embeddings',
    'id,chunk_id,embedding_model,embedding_revision,embedding_version,embedding_dtype,preprocessing',
    (query) => query.eq('embedding_version', expected.version),
  ),
])

assert(sources.length === expected.sources, `옵시디언 원문 수: ${sources.length}`)
assert(resources.length === expected.sources, `구조화 문서 수: ${resources.length}`)
assert(chunks.length === expected.knowledgeChunks, `옵시디언 청크 수: ${chunks.length}`)
assert(sopChunks.length === expected.sopChunks, `SOP 원문 수: ${sopChunks.length}`)
assert(sopEmbeddings.length === expected.sopChunks, `SOP 임베딩 수: ${sopEmbeddings.length}`)

const sourceById = new Map(sources.map((source) => [source.id, source]))
for (const resource of resources) {
  const source = sourceById.get(resource.source_id)
  assert(source, `구조화 원문 누락: ${resource.source_id}`)
  assert(resource.analysis_status === 'completed', `${source.relative_path} 구조화 미완료`)
  assert(resource.analysis_model === 'claude-sonnet-5', `${source.relative_path} 분석 모델 불일치`)
  assert(resource.source_content_hash === source.content_hash, `${source.relative_path} 분석 해시 불일치`)
  assert(resource.analysis_input_tokens > 0, `${source.relative_path} 입력 토큰 누락`)
  assert(resource.analysis_output_tokens > 0, `${source.relative_path} 출력 토큰 누락`)
  assert(resource.key_claims.length >= 3, `${source.relative_path} 근거 주장 부족`)
  validateEvidence(source.raw_markdown, resource.key_claims, 'key_claims', source.relative_path)
  validateEvidence(source.raw_markdown, resource.illustrations, 'illustrations', source.relative_path)
  validateEvidence(source.raw_markdown, resource.applications, 'applications', source.relative_path)
}

for (const chunk of chunks) {
  const source = sourceById.get(chunk.source_id)
  assert(source, `청크 원문 누락: ${chunk.id}`)
  assert(
    source.raw_markdown.slice(chunk.content_start_offset, chunk.content_end_offset) === chunk.content,
    `${source.relative_path} 청크 offset 불일치`,
  )
  assert(chunk.embedding_model === expected.model, `${source.relative_path} 청크 모델 불일치`)
  assert(chunk.embedding_revision === expected.revision, `${source.relative_path} 청크 revision 불일치`)
}

for (const embedding of sopEmbeddings) {
  assert(embedding.embedding_model === expected.model, 'SOP 임베딩 모델 불일치')
  assert(embedding.embedding_revision === expected.revision, 'SOP 임베딩 revision 불일치')
  assert(embedding.embedding_dtype === 'q8', 'SOP dtype 불일치')
}

const postgres = new pg.Client({
  connectionString: normalizedDatabaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
})
await postgres.connect()
try {
  const knowledgeIntegrity = await postgres.query(`
    select
      count(*)::int as total,
      count(*) filter (where embedding is null)::int as nulls,
      count(*) filter (where vector_dims(embedding) <> $1)::int as wrong_dimensions
    from public.knowledge_chunks
    where embedding_version = $2
  `, [expected.dimensions, expected.version])
  const sopIntegrity = await postgres.query(`
    select
      count(*)::int as total,
      count(*) filter (where vector_dims(embedding) <> $1)::int as wrong_dimensions
    from public.sop_chunk_embeddings
    where embedding_version = $2
  `, [expected.dimensions, expected.version])
  const rpc = await postgres.query(`
    select count(*)::int as matches
    from public.match_sop_chunks(
      (select embedding from public.sop_chunk_embeddings where embedding_version = $1 limit 1),
      -1,
      1,
      $1
    )
  `, [expected.version])

  assert(knowledgeIntegrity.rows[0].total === expected.knowledgeChunks, 'knowledge vector 수 불일치')
  assert(knowledgeIntegrity.rows[0].nulls === 0, 'knowledge vector null 존재')
  assert(knowledgeIntegrity.rows[0].wrong_dimensions === 0, 'knowledge vector 차원 불일치')
  assert(sopIntegrity.rows[0].total === expected.sopChunks, 'SOP vector 수 불일치')
  assert(sopIntegrity.rows[0].wrong_dimensions === 0, 'SOP vector 차원 불일치')
  assert(rpc.rows[0].matches === 1, 'match_sop_chunks RPC 검증 실패')
} finally {
  await postgres.end()
}

const usage = resources.reduce(
  (total, resource) => ({
    input: total.input + resource.analysis_input_tokens,
    output: total.output + resource.analysis_output_tokens,
  }),
  { input: 0, output: 0 },
)

console.log(JSON.stringify({
  sources: sources.length,
  resources: resources.length,
  knowledgeChunks: chunks.length,
  sopChunks: sopChunks.length,
  sopEmbeddings: sopEmbeddings.length,
  dimensions: expected.dimensions,
  analysisUsage: usage,
  status: 'OK',
}))
