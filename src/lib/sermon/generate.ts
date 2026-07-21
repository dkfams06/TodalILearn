import type { SupabaseClient } from '@supabase/supabase-js'

import type { BibleFetch } from '@/lib/bible/getbible'
import { runClaudePrint, type JsonSchema } from '@/lib/claude/print'

import type {
  SermonDraft,
  SermonSection,
  SermonSentence,
  SermonSentenceType,
} from './types'
import { verifyResearchForSermon, type VerifiedResearch } from './verify'

export const SERMON_PROMPT_VERSION = 'sprint6-sermon-v1'
export const CHARS_PER_MINUTE = 270
export const SERMON_MINIMUM_CHARS = 2_000
export const SERMON_MAXIMUM_CHARS = 5_500

const GENERATED_SECTIONS = [
  { key: 'opening', heading: '마음 열기', minimum: 2, maximum: 5 },
  { key: 'meditation', heading: '본문 묵상', minimum: 6, maximum: 20 },
  { key: 'connection', heading: '자료와 함께 보기', minimum: 0, maximum: 12 },
  { key: 'application', heading: '우리의 적용', minimum: 3, maximum: 10 },
] as const

type GeneratedSectionKey = (typeof GENERATED_SECTIONS)[number]['key']

const GENERATED_SENTENCE_TYPES = [
  'direct', 'summary', 'synthesis', 'application', 'transition',
] as const satisfies readonly SermonSentenceType[]

type RawSermonSentence = {
  type: (typeof GENERATED_SENTENCE_TYPES)[number]
  text: string
  sourceIds: string[]
}

type RawSermon = Record<GeneratedSectionKey, RawSermonSentence[]> & {
  title: string
  questions: string[]
  prayer: string[]
}

function sentenceSchema(allIds: string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: [...GENERATED_SENTENCE_TYPES] },
      text: { type: 'string' },
      sourceIds: {
        type: 'array',
        items: allIds.length > 0 ? { type: 'string', enum: allIds } : { type: 'string' },
        uniqueItems: true,
        maxItems: 4,
      },
    },
    required: ['type', 'text', 'sourceIds'],
  }
}

export function createSermonSchema(allIds: string[]): JsonSchema {
  const sentences = sentenceSchema(allIds)
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      ...Object.fromEntries(GENERATED_SECTIONS.map((section) => [section.key, {
        type: 'array',
        items: sentences,
        minItems: section.minimum,
        maxItems: section.maximum,
      }])),
      questions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
      prayer: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 },
    },
    required: ['title', ...GENERATED_SECTIONS.map((section) => section.key), 'questions', 'prayer'],
  }
}

function normalizeForQuote(value: string) {
  return value.replace(/[\s"'“”‘’「」『』]+/g, ' ').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}가 비어 있습니다.`)
  const trimmed = value.trim()
  if (trimmed.length > maximum) throw new Error(`${field}가 ${maximum}자를 초과했습니다.`)
  return trimmed
}

function validateSentences({
  value,
  field,
  minimum,
  maximum,
  verified,
  passageTextById,
}: {
  value: unknown
  field: string
  minimum: number
  maximum: number
  verified: VerifiedResearch
  passageTextById: Map<string, string>
}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${field}는 ${minimum}~${maximum}문장이어야 합니다.`)
  }
  const allowedIds = new Set([
    ...verified.biblePassages.map((passage) => passage.id),
    ...verified.knowledgeSources.map((source) => source.id),
    ...verified.sopSources.map((source) => source.id),
  ])
  return value.map((item, index): Omit<SermonSentence, 'id'> => {
    if (!isRecord(item)) throw new Error(`${field}[${index}]가 객체가 아닙니다.`)
    const type = GENERATED_SENTENCE_TYPES.find((candidate) => candidate === item.type)
    if (!type) throw new Error(`${field}[${index}]의 문장 유형이 올바르지 않습니다.`)
    const text = requiredText(item.text, `${field}[${index}].text`, 300)
    if (!Array.isArray(item.sourceIds)) throw new Error(`${field}[${index}].sourceIds가 배열이 아닙니다.`)
    const sourceIds = [...new Set(item.sourceIds.map((id, idIndex) =>
      requiredText(id, `${field}[${index}].sourceIds[${idIndex}]`, 5)))]
    if (sourceIds.some((id) => !allowedIds.has(id))) {
      throw new Error(`${field}[${index}]가 검증된 후보에 없는 출처를 참조합니다.`)
    }

    if (type === 'direct') {
      if (sourceIds.length !== 1 || !sourceIds[0].startsWith('B')) {
        throw new Error(`${field}[${index}] direct 문장은 성경 ID 하나만 출처로 가져야 합니다.`)
      }
      const passageText = passageTextById.get(sourceIds[0])
      if (!passageText || !passageText.includes(normalizeForQuote(text))) {
        throw new Error(`${field}[${index}] direct 문장이 ${sourceIds[0]} 원문에 없습니다.`)
      }
    }
    if (type === 'summary' && sourceIds.length < 1) {
      throw new Error(`${field}[${index}] summary 문장에는 출처가 1개 이상 필요합니다.`)
    }
    if (type === 'synthesis' && sourceIds.length < 2) {
      throw new Error(`${field}[${index}] synthesis 문장에는 출처가 2개 이상 필요합니다.`)
    }
    if ((type === 'application' || type === 'transition') && sourceIds.length > 0) {
      throw new Error(`${field}[${index}] ${type} 문장에는 출처를 붙이지 않습니다.`)
    }
    return { type, text, sourceIds }
  })
}

export function validateSermonOutput({
  value,
  verified,
}: {
  value: unknown
  verified: VerifiedResearch
}) {
  if (!isRecord(value)) throw new Error('설교 응답이 객체가 아닙니다.')
  const passageTextById = new Map(verified.biblePassages.map((passage) => [
    passage.id,
    normalizeForQuote(passage.verses.map((verse) => verse.text).join(' ')),
  ]))

  const title = requiredText(value.title, 'title', 80)
  const sections = {} as Record<GeneratedSectionKey, Array<Omit<SermonSentence, 'id'>>>
  for (const section of GENERATED_SECTIONS) {
    const hasSources = verified.knowledgeSources.length + verified.sopSources.length > 0
    const minimum = section.key === 'connection' && !hasSources ? 0 : section.minimum
    const maximum = section.key === 'connection' && !hasSources ? 0 : section.maximum
    sections[section.key] = validateSentences({
      value: value[section.key],
      field: section.key,
      minimum,
      maximum,
      verified,
      passageTextById,
    })
  }

  if (!Array.isArray(value.questions) || value.questions.length !== 2) {
    throw new Error('나눔 질문은 정확히 2개여야 합니다.')
  }
  const questions = value.questions.map((item, index) =>
    requiredText(item, `questions[${index}]`, 200))

  if (!Array.isArray(value.prayer) || value.prayer.length < 3 || value.prayer.length > 8) {
    throw new Error('기도는 3~8문장이어야 합니다.')
  }
  const prayer = value.prayer.map((item, index): Omit<SermonSentence, 'id'> => ({
    type: 'prayer',
    text: requiredText(item, `prayer[${index}]`, 300),
    sourceIds: [],
  }))

  return { title, sections, questions, prayer }
}

export function assembleSermonSections({
  verified,
  sections,
  prayer,
}: {
  verified: VerifiedResearch
  sections: Record<GeneratedSectionKey, Array<Omit<SermonSentence, 'id'>>>
  prayer: Array<Omit<SermonSentence, 'id'>>
}) {
  const mainPassage = verified.biblePassages[0]
  let sequence = 0
  const withIds = (items: Array<Omit<SermonSentence, 'id'>>): SermonSentence[] =>
    items.map((item) => {
      sequence += 1
      return { ...item, id: `s${String(sequence).padStart(3, '0')}` }
    })

  const assembled: SermonSection[] = [
    { sectionId: 'opening', heading: '마음 열기', sentences: withIds(sections.opening) },
    {
      sectionId: 'scripture',
      heading: `본문 봉독 · ${mainPassage.reference} (${mainPassage.translation})`,
      sentences: withIds(mainPassage.verses.map((verse) => ({
        type: 'direct' as const,
        text: `${verse.verse}. ${verse.text.trim()}`,
        sourceIds: [mainPassage.id],
      }))),
    },
    { sectionId: 'meditation', heading: '본문 묵상', sentences: withIds(sections.meditation) },
    ...(sections.connection.length > 0
      ? [{
          sectionId: 'connection' as const,
          heading: '자료와 함께 보기',
          sentences: withIds(sections.connection),
        }]
      : []),
    { sectionId: 'application', heading: '우리의 적용', sentences: withIds(sections.application) },
  ]
  return { assembled, prayerSentences: withIds(prayer) }
}

function formatVerifiedBible(verified: VerifiedResearch) {
  return verified.biblePassages.map((passage) =>
    `<bible id="${passage.id}" role="${passage.role}" reference="${passage.reference}">\n${passage.verses.map((verse) => `${verse.verse} ${verse.text}`).join('\n')}\n</bible>`,
  ).join('\n\n')
}

function truncate(value: string, maximum: number) {
  const trimmed = value.trim()
  return trimmed.length <= maximum ? trimmed : `${trimmed.slice(0, maximum).trimEnd()}…`
}

function formatVerifiedSources(verified: VerifiedResearch) {
  const knowledge = verified.knowledgeSources.map((source) => [
    `<source id="${source.id}" type="obsidian" title="${source.title}">`,
    `선택 이유: ${source.selectionReason}`,
    truncate(source.excerpt, 6_000),
    '</source>',
  ].join('\n'))
  const sop = verified.sopSources.map((source) => [
    `<source id="${source.id}" type="sop" title="${source.book} ${source.chapter}장 · ${source.title}">`,
    `선택 이유: ${source.selectionReason}`,
    truncate(source.excerpt, 2_500),
    '</source>',
  ].join('\n'))
  const formatted = [...knowledge, ...sop].join('\n\n')
  return formatted || '선택된 자료가 없습니다. 성경 본문만으로 설교를 구성하세요.'
}

function formatResearchContext(verified: VerifiedResearch) {
  return [
    `핵심 메시지: ${verified.coreMessage}`,
    '',
    '본문 흐름:',
    ...verified.bibleFlow.map((flow) => `- ${flow.statement} [${flow.bibleIds.join(', ')}]`),
    '',
    '자료 연결:',
    ...(verified.connections.length > 0
      ? verified.connections.map((connection) => `- ${connection.statement} [${connection.sourceIds.join(', ')}]`)
      : ['- 없음']),
    '',
    '관계 적용 후보:',
    ...verified.relationshipApplications.map((application) => `- ${application}`),
    '',
    '주의할 점:',
    ...verified.cautions.map((caution) => `- ${caution}`),
  ].join('\n')
}

export async function synthesizeSermon({
  model,
  verified,
}: {
  model: string
  verified: VerifiedResearch
}) {
  const allIds = [
    ...verified.biblePassages.map((passage) => passage.id),
    ...verified.knowledgeSources.map((source) => source.id),
    ...verified.sopSources.map((source) => source.id),
  ]
  const response = await runClaudePrint<RawSermon>({
    model,
    systemPrompt: [
      '당신은 연인 두 사람이 함께 드리는 가정예배 설교 원고를 쓰는 조력자입니다. 두 사람이 마주 앉아 함께 읽는 묵상 원고이며 공적 강단 설교가 아닙니다.',
      '제공된 성경 본문과 자료의 내용만 사용하고, 입력에 없는 성경 구절·역사 사실·자료 주장을 만들지 마세요.',
      'direct 문장은 제공된 성경 본문 안의 구절을 한 글자도 바꾸지 않고 그대로 옮긴 짧은 인용이어야 하며, 출처는 해당 성경 ID 하나입니다. 성경 본문 전체 봉독은 서버가 따로 삽입하므로 다시 쓰지 마세요.',
      'summary 문장은 한 자료(성경 포함)의 내용을 요약하며 출처 ID를 1개 이상 붙입니다. synthesis 문장은 두 개 이상의 출처를 연결하며 출처 ID를 2개 이상 붙입니다.',
      'application과 transition 문장은 AI가 쓰는 적용·연결 문장이므로 출처를 붙이지 않습니다.',
      '자료의 주장은 그 자료의 관점으로 소개하고 성경 본문과 같은 권위로 합치지 마세요.',
      '상대를 가르치거나 책망하거나 설득하지 마세요. 너는·당신은 대신 우리를 사용하고, 함께 선택할 수 있는 1인칭 복수 제안으로 쓰세요.',
      '하나의 핵심 메시지가 처음부터 끝까지 분명히 남게 하세요.',
      '전체 낭독 분량은 약 10분입니다. opening·meditation·connection·application·questions·prayer의 글자 수 합계가 2,300~3,200자가 되게 하세요.',
      '나눔 질문 2개는 두 사람이 서로에게 답할 수 있는 열린 질문으로, 기도는 두 사람이 함께 소리 내어 읽는 우리의 기도로 쓰세요.',
    ].join('\n'),
    prompt: [
      `연구 질문: ${verified.query}`,
      `두 사람의 상황: ${verified.personalContext || '별도 입력 없음'}`,
      '',
      '<research_summary>',
      formatResearchContext(verified),
      '</research_summary>',
      '',
      '<verified_bible>',
      formatVerifiedBible(verified),
      '</verified_bible>',
      '',
      '<verified_sources>',
      formatVerifiedSources(verified),
      '</verified_sources>',
      '',
      '위 연구 묶음으로 가정예배 설교 원고를 작성하세요.',
      '구성: opening(마음 열기 2~5문장) → meditation(본문 묵상 6~20문장) → connection(자료와 함께 보기, 선택 자료가 있을 때만 2~12문장, 없으면 빈 배열) → application(우리의 적용 3~10문장) → questions(나눔 질문 정확히 2개) → prayer(함께 드리는 기도 3~8문장).',
    ].join('\n'),
    schema: createSermonSchema(allIds),
  })
  return response
}

export async function createSermonDraft({
  database,
  userId,
  model,
  research,
  fetcher,
}: {
  database: SupabaseClient
  userId: string
  model: string
  research: unknown
  fetcher?: BibleFetch
}): Promise<SermonDraft> {
  const startedAt = performance.now()
  const verified = await verifyResearchForSermon({ database, userId, research, fetcher })
  const { data, usage } = await synthesizeSermon({ model, verified })
  const { title, sections, questions, prayer } = validateSermonOutput({ value: data, verified })
  const { assembled, prayerSentences } = assembleSermonSections({ verified, sections, prayer })

  const totalChars = [
    ...assembled.flatMap((section) => section.sentences),
    ...prayerSentences,
  ].reduce((sum, sentence) => sum + sentence.text.length, 0) +
    questions.reduce((sum, question) => sum + question.length, 0)
  if (totalChars < SERMON_MINIMUM_CHARS || totalChars > SERMON_MAXIMUM_CHARS) {
    throw new Error(`설교 분량(${totalChars}자)이 허용 범위(${SERMON_MINIMUM_CHARS}~${SERMON_MAXIMUM_CHARS}자)를 벗어났습니다.`)
  }

  return {
    query: verified.query,
    personalContext: verified.personalContext,
    coreMessage: verified.coreMessage,
    title,
    estimatedMinutes: Math.max(1, Math.round(totalChars / CHARS_PER_MINUTE)),
    totalChars,
    biblePassages: verified.biblePassages,
    sections: assembled,
    questions,
    prayer: prayerSentences,
    knowledgeSources: verified.knowledgeSources,
    sopSources: verified.sopSources,
    provider: 'claude-code-subscription',
    model,
    promptVersion: SERMON_PROMPT_VERSION,
    elapsedMs: Math.round(performance.now() - startedAt),
    usage,
  }
}
