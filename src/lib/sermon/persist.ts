import { parseEditReasons } from './evaluation'
import type { SermonVersionInput } from './types'
import type { SermonDraft } from './types'

const MAX_DRAFT_BYTES = 200_000
const MAX_VERSION_CHARS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// 브라우저가 보낸 설교 draft는 이미 서버가 생성·검증한 값이지만, 저장 전에
// 재렌더링에 필요한 최소 구조와 크기만 다시 확인한다(단일 사용자 자기 데이터).
export function parseSermonDraftForSave(value: unknown): SermonDraft {
  if (!isRecord(value)) throw new Error('설교 데이터가 필요합니다.')

  const title = requiredString(value.title, 'title', 200)
  const query = requiredString(value.query, 'query', 300)
  const coreMessage = requiredString(value.coreMessage, 'coreMessage', 2000)
  const estimatedMinutes = requiredInteger(value.estimatedMinutes, 'estimatedMinutes')
  const totalChars = requiredInteger(value.totalChars, 'totalChars')

  for (const field of ['sections', 'questions', 'prayer', 'biblePassages', 'knowledgeSources', 'sopSources'] as const) {
    if (!Array.isArray(value[field])) throw new Error(`${field}가 배열이 아닙니다.`)
  }
  if ((value.sections as unknown[]).length === 0) throw new Error('설교 구획이 비어 있습니다.')
  if ((value.questions as unknown[]).length !== 2) throw new Error('나눔 질문은 2개여야 합니다.')

  const size = Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (size > MAX_DRAFT_BYTES) throw new Error('설교 데이터가 너무 큽니다.')

  const draft = value as unknown as SermonDraft
  return { ...draft, title, query, coreMessage, estimatedMinutes, totalChars }
}

// 편집한 Markdown 본문을 새 버전으로 저장하기 전에 검증한다.
export function parseVersionInputForSave(value: unknown): SermonVersionInput {
  if (!isRecord(value)) throw new Error('버전 데이터가 필요합니다.')

  if (typeof value.content !== 'string' || !value.content.trim()) {
    throw new Error('설교 본문이 비어 있습니다.')
  }
  const content = value.content.replace(/\r\n/g, '\n')
  if (content.length > MAX_VERSION_CHARS) throw new Error('설교 본문이 너무 깁니다.')

  const editReasons = parseEditReasons(value.editReasons)

  let note: string | null = null
  if (value.note !== undefined && value.note !== null && value.note !== '') {
    if (typeof value.note !== 'string') throw new Error('메모가 올바르지 않습니다.')
    const trimmed = value.note.trim()
    if (trimmed.length > 2000) throw new Error('메모가 2,000자를 초과했습니다.')
    note = trimmed || null
  }

  return { content, editReasons, note, source: 'web' }
}

function requiredString(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}가 비어 있습니다.`)
  const trimmed = value.trim()
  if (trimmed.length > maximum) throw new Error(`${field}가 ${maximum}자를 초과했습니다.`)
  return trimmed
}

function requiredInteger(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field}가 올바르지 않습니다.`)
  }
  return value
}
