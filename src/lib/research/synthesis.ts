import { runClaudePrint, type JsonSchema } from '@/lib/claude/print'

import type { ResearchBibleFlow, ResearchConnection } from './types'

export const RESEARCH_PROMPT_VERSION = 'sprint5-research-v1'

export type SynthesisBibleCandidate = {
  id: string
  reference: string
  text: string
  linkedSourceIds: string[]
}

export type SynthesisSourceCandidate = {
  id: string
  type: 'obsidian' | 'sop'
  title: string
  locator: string
  reasons: string[]
  excerpt: string
}

type RawSynthesis = {
  mainBibleId: string
  relatedBibleIds: string[]
  coreMessage: string
  bibleFlow: Array<{ statement: string; bibleIds: string[] }>
  connections: Array<{ statement: string; sourceIds: string[] }>
  relationshipApplications: string[]
  cautions: string[]
  sourceSelections: Array<{ sourceId: string; reason: string }>
}

export type ValidatedSynthesis = Omit<RawSynthesis, 'sourceSelections'> & {
  sourceSelections: Map<string, string>
}

function idArraySchema(ids: string[]): JsonSchema {
  return ids.length > 0 ? { type: 'string', enum: ids } : { type: 'string' }
}

export function createResearchSchema(
  bibleIds: string[],
  sourceIds: string[],
  maximumSourceSelections = Math.min(4, sourceIds.length),
): JsonSchema {
  const allIds = [...bibleIds, ...sourceIds]
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      mainBibleId: idArraySchema(bibleIds),
      relatedBibleIds: {
        type: 'array', items: idArraySchema(bibleIds), uniqueItems: true, maxItems: 4,
      },
      coreMessage: { type: 'string' },
      bibleFlow: {
        type: 'array', minItems: 1, maxItems: 6,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            statement: { type: 'string' },
            bibleIds: { type: 'array', items: idArraySchema(bibleIds), uniqueItems: true, minItems: 1 },
          },
          required: ['statement', 'bibleIds'],
        },
      },
      connections: {
        type: 'array', maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            statement: { type: 'string' },
            sourceIds: { type: 'array', items: idArraySchema(allIds), uniqueItems: true, minItems: 1 },
          },
          required: ['statement', 'sourceIds'],
        },
      },
      relationshipApplications: {
        type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5,
      },
      cautions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
      sourceSelections: {
        type: 'array', maxItems: maximumSourceSelections,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            sourceId: idArraySchema(sourceIds),
            reason: { type: 'string' },
          },
          required: ['sourceId', 'reason'],
        },
      },
    },
    required: [
      'mainBibleId', 'relatedBibleIds', 'coreMessage', 'bibleFlow', 'connections',
      'relationshipApplications', 'cautions', 'sourceSelections',
    ],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}가 비어 있습니다.`)
  return value.trim()
}

function uniqueIds(value: unknown, field: string, allowed: Set<string>, max?: number) {
  if (!Array.isArray(value)) throw new Error(`${field}는 배열이어야 합니다.`)
  const ids = value.map((item) => requiredString(item, field))
  if (ids.some((id) => !allowed.has(id))) throw new Error(`${field}에 입력 후보가 아닌 ID가 있습니다.`)
  const unique = [...new Set(ids)]
  if (max !== undefined && unique.length > max) throw new Error(`${field}가 ${max}개를 초과했습니다.`)
  return unique
}

function stringArray(value: unknown, field: string, min: number, max: number) {
  if (!Array.isArray(value)) throw new Error(`${field}는 배열이어야 합니다.`)
  const values = [...new Set(value.map((item) => requiredString(item, field)))]
  if (values.length < min || values.length > max) {
    throw new Error(`${field}는 ${min}~${max}개여야 합니다.`)
  }
  return values
}

function validateFlows(value: unknown, allowedBibleIds: Set<string>, chosenBibleIds: Set<string>) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw new Error('bibleFlow는 1~6개여야 합니다.')
  }
  return value.map((item, index): ResearchBibleFlow => {
    if (!isRecord(item)) throw new Error(`bibleFlow[${index}]가 객체가 아닙니다.`)
    const ids = uniqueIds(item.bibleIds, `bibleFlow[${index}].bibleIds`, allowedBibleIds)
    if (ids.length === 0 || ids.some((id) => !chosenBibleIds.has(id))) {
      throw new Error(`bibleFlow[${index}]가 선택되지 않은 성경 본문을 참조합니다.`)
    }
    return { statement: requiredString(item.statement, `bibleFlow[${index}].statement`), bibleIds: ids }
  })
}

function validateConnections(
  value: unknown,
  allowedIds: Set<string>,
  chosenIds: Set<string>,
) {
  if (!Array.isArray(value) || value.length > 8) throw new Error('connections는 최대 8개여야 합니다.')
  return value.map((item, index): ResearchConnection => {
    if (!isRecord(item)) throw new Error(`connections[${index}]가 객체가 아닙니다.`)
    const ids = uniqueIds(item.sourceIds, `connections[${index}].sourceIds`, allowedIds)
    if (ids.length === 0 || ids.some((id) => !chosenIds.has(id))) {
      throw new Error(`connections[${index}]가 선택되지 않은 근거를 참조합니다.`)
    }
    return { statement: requiredString(item.statement, `connections[${index}].statement`), sourceIds: ids }
  })
}

export function validateResearchSynthesis({
  value,
  bibleIds,
  sourceIds,
  forcedSourceIds,
}: {
  value: unknown
  bibleIds: string[]
  sourceIds: string[]
  forcedSourceIds?: string[]
}): ValidatedSynthesis {
  if (!isRecord(value)) throw new Error('연구 종합 응답이 객체가 아닙니다.')
  const allowedBibleIds = new Set(bibleIds)
  const allowedSourceIds = new Set(sourceIds)
  const mainBibleId = requiredString(value.mainBibleId, 'mainBibleId')
  if (!allowedBibleIds.has(mainBibleId)) throw new Error('대표 본문 ID가 입력 후보에 없습니다.')
  const relatedBibleIds = uniqueIds(value.relatedBibleIds, 'relatedBibleIds', allowedBibleIds, 4)
    .filter((id) => id !== mainBibleId)
  const chosenBibleIds = new Set([mainBibleId, ...relatedBibleIds])

  if (!Array.isArray(value.sourceSelections)) throw new Error('sourceSelections는 배열이어야 합니다.')
  const sourceSelections = new Map<string, string>()
  for (const [index, item] of value.sourceSelections.entries()) {
    if (!isRecord(item)) throw new Error(`sourceSelections[${index}]가 객체가 아닙니다.`)
    const id = requiredString(item.sourceId, `sourceSelections[${index}].sourceId`)
    if (!allowedSourceIds.has(id)) throw new Error('자료 선택 ID가 입력 후보에 없습니다.')
    sourceSelections.set(id, requiredString(item.reason, `sourceSelections[${index}].reason`))
  }
  const chosenSourceIds = forcedSourceIds ? new Set(forcedSourceIds) : new Set(sourceSelections.keys())
  if ([...chosenSourceIds].some((id) => !allowedSourceIds.has(id))) {
    throw new Error('강제 선택 자료 ID가 입력 후보에 없습니다.')
  }
  const chosenIds = new Set([...chosenBibleIds, ...chosenSourceIds])
  const allowedIds = new Set([...bibleIds, ...sourceIds])

  return {
    mainBibleId,
    relatedBibleIds,
    coreMessage: requiredString(value.coreMessage, 'coreMessage'),
    bibleFlow: validateFlows(value.bibleFlow, allowedBibleIds, chosenBibleIds),
    connections: validateConnections(value.connections, allowedIds, chosenIds),
    relationshipApplications: stringArray(value.relationshipApplications, 'relationshipApplications', 2, 5),
    cautions: stringArray(value.cautions, 'cautions', 1, 5),
    sourceSelections,
  }
}

function formatBibleCandidates(candidates: SynthesisBibleCandidate[]) {
  return candidates.map((candidate) =>
    `<bible id="${candidate.id}" reference="${candidate.reference}" linkedSources="${candidate.linkedSourceIds.join(',') || 'explicit-input'}">\n${candidate.text}\n</bible>`,
  ).join('\n\n')
}

function formatSourceCandidates(candidates: SynthesisSourceCandidate[]) {
  return candidates.map((candidate) => [
    `<source id="${candidate.id}" type="${candidate.type}" title="${candidate.title}" locator="${candidate.locator}">`,
    `검색 이유: ${candidate.reasons.join(', ')}`,
    candidate.excerpt,
    '</source>',
  ].join('\n')).join('\n\n')
}

export async function synthesizeResearch({
  model,
  query,
  inputType,
  personalContext,
  bibleCandidates,
  sourceCandidates,
  forcedSourceIds,
}: {
  model: string
  query: string
  inputType: 'bible_reference' | 'relationship' | 'social' | 'theme'
  personalContext: string
  bibleCandidates: SynthesisBibleCandidate[]
  sourceCandidates: SynthesisSourceCandidate[]
  forcedSourceIds?: string[]
}) {
  const bibleIds = bibleCandidates.map((candidate) => candidate.id)
  const sourceIds = sourceCandidates.map((candidate) => candidate.id)
  const response = await runClaudePrint<RawSynthesis>({
    model,
    systemPrompt: [
      '당신은 연인 두 사람이 함께 드리는 가정예배를 준비하는 성경 연구 조력자입니다.',
      '제공된 후보의 ID와 내용만 사용하고 입력에 없는 성경 구절, 역사 사실, 자료 주장을 만들지 마세요.',
      '성경 원문을 다시 인용하지 말고 해설만 작성하세요. 실제 인용문은 서버가 GetBible 원문으로 결합합니다.',
      '자료 주장은 해당 자료의 관점으로 표시하고 성경 본문과 같은 권위로 합치지 마세요.',
      '관계 적용은 상대를 책망하거나 설득하지 말고 우리가 함께 시도할 수 있는 1인칭 복수 제안으로 쓰세요.',
      '관련성이 없는 자료는 수량을 채우기 위해 선택하지 마세요.',
      forcedSourceIds === undefined
        ? '자료는 직접 관련성이 분명한 0~4개만 선택하세요. 의미가 넓게 비슷하다는 이유만으로 선택하지 마세요.'
        : '사용자가 선택한 자료는 모두 유지하되 연결이 약한 부분은 cautions에 분명히 알리세요.',
      '대표 본문은 질문을 가장 직접적으로 설명하고, 연결된 자료의 핵심 사례와 맞는 구절을 선택하세요.',
      '질문의 중심 신학 주제와 관계 적용 맥락을 구분하세요. 예를 들어 말씀 읽기가 중심이면 관계 일반 본문보다 말씀·순종 본문을 대표로 고르세요.',
      '자료도 중심 신학 주제를 직접 뒷받침하는 것을 우선하고, 단지 관계·사회 같은 넓은 단어가 겹치는 자료는 선택하지 마세요.',
      inputType === 'social'
        ? '이 질문은 사회·역사형입니다. 검색된 사회·역사 자료의 구체 사례를 자동 제외하지 말고, 관련 자료가 있으면 최소 한 개를 선택해 자료의 주장/사례라고 명시하세요. 그 주장을 곧 성경 해석으로 단정하지 마세요.'
        : '입력 유형에 맞는 자료만 선택하세요.',
      '한 자료의 많은 보조 본문보다 여러 자료의 대표 본문과 질문에 명시된 본문을 우선하세요.',
      forcedSourceIds === undefined
        ? 'sourceSelections에는 실제 연결에 필요한 자료만 선택 이유와 함께 넣으세요.'
        : 'sourceSelections에는 사용자가 고른 모든 자료를 넣고 각 자료를 어떻게 사용할지 설명하세요.',
      'connections의 sourceIds는 선택한 대표·관련 성경 ID와 sourceSelections의 자료 ID만 사용하세요.',
    ].join('\n'),
    prompt: [
      `연구 질문: ${query}`,
      `입력 유형: ${inputType}`,
      `두 사람의 상황: ${personalContext || '별도 입력 없음'}`,
      '',
      '<bible_candidates>',
      formatBibleCandidates(bibleCandidates),
      '</bible_candidates>',
      '',
      '<source_candidates>',
      formatSourceCandidates(sourceCandidates),
      '</source_candidates>',
      '',
      '대표 본문 하나와 관련 본문 최대 네 개를 고르고, 하나의 핵심 메시지로 연구 묶음을 구성하세요.',
    ].join('\n'),
    schema: createResearchSchema(
      bibleIds,
      sourceIds,
      forcedSourceIds === undefined ? Math.min(4, sourceIds.length) : sourceIds.length,
    ),
  })

  return {
    synthesis: validateResearchSynthesis({
      value: response.data,
      bibleIds,
      sourceIds,
      forcedSourceIds,
    }),
    usage: response.usage,
  }
}
