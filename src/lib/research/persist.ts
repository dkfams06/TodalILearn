import type { ResearchBundle } from './types'

const MAXIMUM_BUNDLE_BYTES = 500_000

export function validateResearchBundle(value: unknown): ResearchBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('저장할 연구 묶음이 필요합니다.')
  }
  const bundle = value as Partial<ResearchBundle>
  if (
    typeof bundle.query !== 'string' ||
    !bundle.query.trim() ||
    typeof bundle.coreMessage !== 'string' ||
    !bundle.coreMessage.trim() ||
    typeof bundle.personalContext !== 'string' ||
    !['bible_reference', 'relationship', 'social', 'theme'].includes(bundle.inputType ?? '') ||
    !Array.isArray(bundle.biblePassages) ||
    !Array.isArray(bundle.knowledgeSources) ||
    !Array.isArray(bundle.sopSources) ||
    bundle.provider !== 'claude-code-subscription' ||
    typeof bundle.model !== 'string' ||
    typeof bundle.promptVersion !== 'string'
  ) {
    throw new Error('연구 묶음 형식이 올바르지 않습니다.')
  }
  if (Buffer.byteLength(JSON.stringify(bundle), 'utf8') > MAXIMUM_BUNDLE_BYTES) {
    throw new Error('연구 묶음이 저장 가능한 크기를 초과했습니다.')
  }
  return bundle as ResearchBundle
}
