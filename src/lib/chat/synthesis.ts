import { runClaudePrint, type JsonSchema } from '@/lib/claude/print'

export const CHAT_PROMPT_VERSION = 'sprint11-chat-v1'

export type ChatSourceCandidate = {
  id: string
  type: 'obsidian' | 'sop'
  title: string
  locator: string
  reasons: string[]
  excerpt: string
}

export type ChatHistoryTurn = {
  role: 'user' | 'assistant'
  content: string
}

type RawChatAnswer = {
  answer: string
  citations: Array<{ sourceId: string; reason: string }>
}

export type ValidatedChatAnswer = RawChatAnswer

function idEnumSchema(ids: string[]): JsonSchema {
  return ids.length > 0 ? { type: 'string', enum: ids } : { type: 'string' }
}

export function createChatAnswerSchema(sourceIds: string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      citations: {
        type: 'array',
        maxItems: Math.min(6, sourceIds.length),
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceId: idEnumSchema(sourceIds),
            reason: { type: 'string' },
          },
          required: ['sourceId', 'reason'],
        },
      },
    },
    required: ['answer', 'citations'],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}가 비어 있습니다.`)
  return value.trim()
}

export function validateChatAnswer({
  value,
  sourceIds,
}: {
  value: unknown
  sourceIds: string[]
}): ValidatedChatAnswer {
  if (!isRecord(value)) throw new Error('채팅 응답이 객체가 아닙니다.')
  const answer = requiredString(value.answer, 'answer')
  const allowedSourceIds = new Set(sourceIds)
  if (!Array.isArray(value.citations)) throw new Error('citations는 배열이어야 합니다.')
  const citations = value.citations.map((item, index) => {
    if (!isRecord(item)) throw new Error(`citations[${index}]가 객체가 아닙니다.`)
    const sourceId = requiredString(item.sourceId, `citations[${index}].sourceId`)
    if (!allowedSourceIds.has(sourceId)) throw new Error('인용 ID가 검색 후보에 없습니다.')
    return { sourceId, reason: requiredString(item.reason, `citations[${index}].reason`) }
  })
  return { answer, citations }
}

function formatSourceCandidates(candidates: ChatSourceCandidate[]) {
  if (candidates.length === 0) return '(검색된 자료 후보 없음)'
  return candidates.map((candidate) => [
    `<source id="${candidate.id}" type="${candidate.type}" title="${candidate.title}" locator="${candidate.locator}">`,
    `검색 이유: ${candidate.reasons.join(', ')}`,
    candidate.excerpt,
    '</source>',
  ].join('\n')).join('\n\n')
}

function formatHistory(history: ChatHistoryTurn[]) {
  if (history.length === 0) return '(이전 대화 없음)'
  return history.map((turn) => `${turn.role === 'user' ? '사용자' : '조력자'}: ${turn.content}`).join('\n')
}

export async function synthesizeChatAnswer({
  model,
  history,
  message,
  sourceCandidates,
}: {
  model: string
  history: ChatHistoryTurn[]
  message: string
  sourceCandidates: ChatSourceCandidate[]
}) {
  const sourceIds = sourceCandidates.map((candidate) => candidate.id)
  const response = await runClaudePrint<RawChatAnswer>({
    model,
    systemPrompt: [
      '당신은 사용자가 옵시디언에 모은 기독교 영상·강의 대본과 예언의 신 자료를 함께 공부하도록 돕는 개인용 성경연구 조력자입니다.',
      '아래 제공된 <source> 후보의 id와 내용만 근거로 답하고, 후보에 없는 사실·주장·역사적 세부사항을 만들지 마세요.',
      '관련 근거를 찾지 못했으면 자료를 지어내지 말고 찾지 못했다고 솔직히 답하세요.',
      '성경 구절은 정확한 원문을 기억에 의존해 인용하지 말고 장·절 위치만 언급하며, 정확한 본문 확인이 필요하면 사용자에게 직접 찾아보도록 안내하세요.',
      '자료의 주장(직접 인용·요약)과 당신의 종합·설명을 답변 안에서 구분되게 표현하세요.',
      '이전 대화 맥락을 참고해 자연스럽게 이어서 답하되, 근거 없는 추측은 하지 마세요.',
      '답은 대화체로, 너무 길지 않게 핵심 위주로 작성하세요.',
      'citations에는 실제로 답변에 사용한 <source> id만 근거 이유와 함께 넣으세요. 사용하지 않았다면 비워 두세요.',
    ].join('\n'),
    prompt: [
      '<conversation_history>',
      formatHistory(history),
      '</conversation_history>',
      '',
      '<source_candidates>',
      formatSourceCandidates(sourceCandidates),
      '</source_candidates>',
      '',
      `사용자의 새 질문: ${message}`,
    ].join('\n'),
    schema: createChatAnswerSchema(sourceIds),
  })

  return {
    result: validateChatAnswer({ value: response.data, sourceIds }),
    usage: response.usage,
  }
}
