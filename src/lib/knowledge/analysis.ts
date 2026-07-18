import { runClaudePrint, type JsonSchema } from '@/lib/claude/print'

export const ANALYSIS_PROMPT_VERSION = 'sprint3-structure-v1'

const allowedUses = [
  'bible_exposition',
  'historical_context',
  'illustration',
  'application',
] as const

type EvidenceInput = { text: string; evidence_quote: string }

type AnalysisInput = {
  content_type: string
  allowed_uses: string[]
  main_topic: string
  sub_topics: string[]
  main_bible_texts: string[]
  supporting_bible_texts: string[]
  biblical_people: string[]
  biblical_events: string[]
  core_message: string
  summary: string
  key_claims: EvidenceInput[]
  illustrations: EvidenceInput[]
  applications: EvidenceInput[]
}

export type EvidenceRecord = EvidenceInput & {
  content_start_offset: number
  content_end_offset: number
}

export type DocumentAnalysis = Omit<
  AnalysisInput,
  'key_claims' | 'illustrations' | 'applications'
> & {
  key_claims: EvidenceRecord[]
  illustrations: EvidenceRecord[]
  applications: EvidenceRecord[]
  usage: { inputTokens: number | null; outputTokens: number | null }
}

const evidenceSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', description: '원문에 근거해 정리한 짧은 한국어 문장' },
    evidence_quote: {
      type: 'string',
      description: '입력 Markdown에서 공백과 문장부호까지 그대로 복사한 15~120자의 연속 인용문',
    },
  },
  required: ['text', 'evidence_quote'],
}

export const ANALYSIS_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
      content_type: {
        type: 'string',
        enum: ['sermon', 'bible_study', 'lecture', 'testimony', 'history', 'other'],
      },
      allowed_uses: {
        type: 'array',
        items: { type: 'string', enum: [...allowedUses] },
        minItems: 1,
      },
      main_topic: { type: 'string' },
      sub_topics: { type: 'array', items: { type: 'string' } },
      main_bible_texts: { type: 'array', items: { type: 'string' } },
      supporting_bible_texts: { type: 'array', items: { type: 'string' } },
      biblical_people: { type: 'array', items: { type: 'string' } },
      biblical_events: { type: 'array', items: { type: 'string' } },
      core_message: { type: 'string' },
      summary: { type: 'string' },
      key_claims: { type: 'array', items: evidenceSchema, minItems: 3, maxItems: 10 },
      illustrations: { type: 'array', items: evidenceSchema, maxItems: 8 },
      applications: { type: 'array', items: evidenceSchema, maxItems: 8 },
  },
  required: [
      'content_type',
      'allowed_uses',
      'main_topic',
      'sub_topics',
      'main_bible_texts',
      'supporting_bible_texts',
      'biblical_people',
      'biblical_events',
      'core_message',
      'summary',
      'key_claims',
      'illustrations',
      'applications',
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}가 비어 있습니다.`)
  return value.trim()
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field}는 문자열 배열이어야 합니다.`)
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
}

function evidenceRecords(markdown: string, value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field}는 배열이어야 합니다.`)
  const records: EvidenceRecord[] = []

  for (const item of value) {
    if (!isRecord(item)) continue
    const text = requiredString(item.text, `${field}.text`)
    const evidenceQuote = requiredString(item.evidence_quote, `${field}.evidence_quote`)
    const contentStartOffset = markdown.indexOf(evidenceQuote)
    if (contentStartOffset === -1) continue
    records.push({
      text,
      evidence_quote: evidenceQuote,
      content_start_offset: contentStartOffset,
      content_end_offset: contentStartOffset + evidenceQuote.length,
    })
  }

  return records
}

export function validateAnalysis(markdown: string, value: unknown) {
  if (!isRecord(value)) throw new Error('구조화 응답이 객체가 아닙니다.')
  const contentType = requiredString(value.content_type, 'content_type')
  const uses = stringArray(value.allowed_uses, 'allowed_uses').filter((item) =>
    allowedUses.includes(item as (typeof allowedUses)[number]),
  )
  if (uses.length === 0) throw new Error('allowed_uses가 비어 있습니다.')

  const analysis = {
    content_type: contentType,
    allowed_uses: uses,
    main_topic: requiredString(value.main_topic, 'main_topic'),
    sub_topics: stringArray(value.sub_topics, 'sub_topics'),
    main_bible_texts: stringArray(value.main_bible_texts, 'main_bible_texts'),
    supporting_bible_texts: stringArray(value.supporting_bible_texts, 'supporting_bible_texts'),
    biblical_people: stringArray(value.biblical_people, 'biblical_people'),
    biblical_events: stringArray(value.biblical_events, 'biblical_events'),
    core_message: requiredString(value.core_message, 'core_message'),
    summary: requiredString(value.summary, 'summary'),
    key_claims: evidenceRecords(markdown, value.key_claims, 'key_claims'),
    illustrations: evidenceRecords(markdown, value.illustrations, 'illustrations'),
    applications: evidenceRecords(markdown, value.applications, 'applications'),
  }
  if (analysis.key_claims.length < 3) {
    throw new Error('원문에서 검증된 key_claims가 3개 미만입니다.')
  }
  return analysis
}

export async function analyzeDocument({
  model,
  title,
  markdown,
}: {
  model: string
  title: string
  markdown: string
}): Promise<DocumentAnalysis> {
  const response = await runClaudePrint<AnalysisInput>({
    model,
    systemPrompt: [
      '당신은 기독교 설교 원문을 연구용 데이터로 구조화하는 분석가입니다.',
      '입력에 없는 사실이나 신학적 주장을 추가하지 마세요.',
      'evidence_quote는 반드시 입력 Markdown에서 연속된 문자열을 공백·문장부호까지 정확히 복사하세요.',
      '원문 근거가 없는 주장·예화·적용은 반환하지 마세요.',
    ].join('\n'),
    prompt: `문서 제목: ${title}\n\n다음 Markdown을 구조화하세요.\n\n<document>\n${markdown}\n</document>`,
    schema: ANALYSIS_JSON_SCHEMA,
  })

  return {
    ...validateAnalysis(markdown, response.data),
    usage: response.usage,
  }
}
