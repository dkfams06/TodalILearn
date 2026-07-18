import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { CLAUDE_SUBSCRIPTION_PROVIDER } from '../src/lib/claude/print'
import { ANALYSIS_PROMPT_VERSION, analyzeDocument } from '../src/lib/knowledge/analysis'

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true })

type Source = {
  id: string
  relative_path: string
  title: string | null
  raw_markdown: string
  content_hash: string
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const model = process.env.ANTHROPIC_ANALYSIS_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
  if (!supabaseUrl || !serviceRoleKey) throw new Error('필수 Supabase 환경변수가 필요합니다.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase
    .from('obsidian_sources')
    .select('id,relative_path,title,raw_markdown,content_hash')
    .eq('source_deleted', false)
  if (error) throw error

  const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='))
  const limit = limitArgument ? Number.parseInt(limitArgument.split('=')[1], 10) : Number.POSITIVE_INFINITY
  const sources = ((data ?? []) as Source[])
    .sort((left, right) => left.raw_markdown.length - right.raw_markdown.length)

  let analyzed = 0
  let attempted = 0
  let skipped = 0
  let failed = 0
  let inputTokens = 0
  let outputTokens = 0

  for (const source of sources) {
    if (attempted >= limit) break
    const { data: resource, error: resourceError } = await supabase
      .from('knowledge_resources')
      .select('id,source_content_hash,analysis_model,analysis_prompt_version,analysis_status')
      .eq('source_id', source.id)
      .single()
    if (resourceError) throw resourceError

    if (
      resource.analysis_status === 'completed' &&
      resource.source_content_hash === source.content_hash &&
      resource.analysis_model === model &&
      resource.analysis_prompt_version === ANALYSIS_PROMPT_VERSION
    ) {
      skipped += 1
      continue
    }

    await supabase
      .from('knowledge_resources')
      .update({ analysis_status: 'processing', analysis_error: null })
      .eq('id', resource.id)

    attempted += 1
    try {
      const analysis = await analyzeDocument({
        model,
        title: source.title ?? source.relative_path,
        markdown: source.raw_markdown,
      })
      const { error: updateError } = await supabase
        .from('knowledge_resources')
        .update({
          content_type: analysis.content_type,
          allowed_uses: analysis.allowed_uses,
          main_topic: analysis.main_topic,
          sub_topics: analysis.sub_topics,
          main_bible_texts: analysis.main_bible_texts,
          supporting_bible_texts: analysis.supporting_bible_texts,
          biblical_people: analysis.biblical_people,
          biblical_events: analysis.biblical_events,
          core_message: analysis.core_message,
          summary: analysis.summary,
          key_claims: analysis.key_claims,
          illustrations: analysis.illustrations,
          applications: analysis.applications,
          schema_version: 1,
          analysis_model: model,
          analysis_prompt_version: ANALYSIS_PROMPT_VERSION,
          analysis_status: 'completed',
          analysis_provider: CLAUDE_SUBSCRIPTION_PROVIDER,
          source_content_hash: source.content_hash,
          analysis_input_tokens: analysis.usage.inputTokens,
          analysis_output_tokens: analysis.usage.outputTokens,
          analysis_error: null,
          analyzed_at: new Date().toISOString(),
        })
        .eq('id', resource.id)
      if (updateError) throw updateError

      analyzed += 1
      inputTokens += analysis.usage.inputTokens ?? 0
      outputTokens += analysis.usage.outputTokens ?? 0
      console.log(`${source.relative_path}: 구조화 완료 (${analysis.key_claims.length}개 근거 주장)`)
    } catch (analysisError) {
      failed += 1
      const message = analysisError instanceof Error ? analysisError.message : '구조화 실패'
      await supabase
        .from('knowledge_resources')
        .update({ analysis_status: 'failed', analysis_error: message })
        .eq('id', resource.id)
      console.error(`${source.relative_path}: ${message}`)
    }
  }

  console.log(JSON.stringify({
    provider: CLAUDE_SUBSCRIPTION_PROVIDER,
    model,
    attempted,
    analyzed,
    skipped,
    failed,
    inputTokens,
    outputTokens,
  }))
  if (failed > 0) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
