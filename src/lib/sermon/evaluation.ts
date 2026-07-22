import type {
  EditReasonTag,
  EvaluationScores,
  EvaluationVerdict,
  SermonEvaluationInput,
} from './types'

// docs/05_EVALUATION_PLAN.md의 12개 평가 항목. 순서는 평가표와 동일하다.
export const EVALUATION_ITEMS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'biblicalCentrality', label: '성경 중심성' },
  { key: 'interpretationNaturalness', label: '본문 해석의 자연스러움' },
  { key: 'sopRelevance', label: '예언의 신 활용의 적절성' },
  { key: 'knowledgeRelevance', label: '옵시디언 자료 활용의 관련성' },
  { key: 'citationTrust', label: '출처 신뢰성' },
  { key: 'coreClarity', label: '한 가지 핵심 메시지의 선명함' },
  { key: 'tone', label: '연인에게 적절한 말투' },
  { key: 'applicationBalance', label: '개인 적용과 관계 적용의 균형' },
  { key: 'questionQuality', label: '질문의 대화 가능성' },
  { key: 'prayerQuality', label: '기도문의 자연스러움' },
  { key: 'lengthBalance', label: '반복 없는 분량' },
  { key: 'usageIntent', label: '실제 사용 의향' },
]

export const EVALUATION_VERDICTS: { value: EvaluationVerdict; label: string }[] = [
  { value: 'ready', label: '그대로 사용 가능' },
  { value: 'minor_edit', label: '조금 수정하면 사용 가능' },
  { value: 'major_edit', label: '많이 수정해야 함' },
  { value: 'reject', label: '다시 작성해야 함' },
]

// docs/05_EVALUATION_PLAN.md의 수정 사유 태그.
export const EDIT_REASON_TAGS: { value: EditReasonTag; label: string }[] = [
  { value: 'theology', label: '신학' },
  { value: 'citation', label: '출처' },
  { value: 'tone', label: '말투' },
  { value: 'awkward_expression', label: '어색한 표현' },
  { value: 'repetition', label: '반복' },
  { value: 'relationship_application', label: '관계 적용' },
  { value: 'length', label: '분량' },
  { value: 'question', label: '질문' },
  { value: 'prayer', label: '기도' },
  { value: 'personal_preference', label: '개인 선호' },
]

const VERDICT_VALUES = new Set(EVALUATION_VERDICTS.map((item) => item.value))
const EDIT_REASON_VALUES = new Set(EDIT_REASON_TAGS.map((item) => item.value))

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseScore(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${label} 점수는 1~5 사이의 정수여야 합니다.`)
  }
  return value
}

// 수정 사유 태그 배열을 화이트리스트로 검증한다(중복 제거).
export function parseEditReasons(value: unknown): EditReasonTag[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('수정 사유가 올바르지 않습니다.')
  const tags: EditReasonTag[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !EDIT_REASON_VALUES.has(item as EditReasonTag)) {
      throw new Error(`알 수 없는 수정 사유입니다: ${String(item)}`)
    }
    if (!tags.includes(item as EditReasonTag)) tags.push(item as EditReasonTag)
  }
  return tags
}

function parseNote(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('메모가 올바르지 않습니다.')
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > 2000) throw new Error('메모가 2,000자를 초과했습니다.')
  return trimmed
}

// 브라우저가 보낸 평가 입력을 저장 전에 전수 검증한다.
export function parseEvaluationInput(value: unknown): SermonEvaluationInput {
  if (!isRecord(value)) throw new Error('평가 데이터가 필요합니다.')

  if (!isRecord(value.scores)) throw new Error('평가 점수가 필요합니다.')
  const scores = {} as EvaluationScores
  for (const item of EVALUATION_ITEMS) {
    scores[item.key] = parseScore(value.scores[item.key], item.label)
  }

  if (typeof value.verdict !== 'string' || !VERDICT_VALUES.has(value.verdict as EvaluationVerdict)) {
    throw new Error('전체 판정 값이 올바르지 않습니다.')
  }

  let versionNumber: number | null = null
  if (value.versionNumber !== undefined && value.versionNumber !== null) {
    if (typeof value.versionNumber !== 'number' || !Number.isInteger(value.versionNumber) || value.versionNumber < 1) {
      throw new Error('평가 대상 버전이 올바르지 않습니다.')
    }
    versionNumber = value.versionNumber
  }

  return {
    scores,
    verdict: value.verdict as EvaluationVerdict,
    note: parseNote(value.note),
    versionNumber,
  }
}
