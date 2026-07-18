import { parseBibleReferences } from './bible-reference'
import type { SearchQueryAnalysis } from './types'

const stopWords = new Set([
  '가장', '것', '대한', '대해', '더', '어떻게', '어떤', '무엇', '왜', '우리', '하는', '하다',
  '할까', '인가', '의미하는가', '중요하다', '있다', '없는', '있는', '그리고', '그러나', '보다', '일도',
])

const particlePattern = /(으로|에서|에게|까지|부터|처럼|보다|하고|이며|이고|이나|는|은|이|가|을|를|과|와|의)$/

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTerm(value: string) {
  const stripped = value.replace(particlePattern, '')
  return stripped.length >= 2 ? stripped : value
}

export function analyzeSearchQuery(query: string): SearchQueryAnalysis {
  const originalQuery = query.trim()
  if (originalQuery.length < 2) throw new Error('검색어를 두 글자 이상 입력해 주세요.')
  if (originalQuery.length > 300) throw new Error('검색어는 300자 이하여야 합니다.')

  const normalizedQuery = normalizeSearchText(originalQuery)
  const bibleReferences = parseBibleReferences(originalQuery)
  const referenceWords = new Set(
    bibleReferences.flatMap((reference) => [reference.book.toLowerCase(), String(reference.chapter)]),
  )
  const terms = [...new Set(
    normalizedQuery
      .split(' ')
      .map(normalizeTerm)
      .filter((term) => term.length >= 2 && !stopWords.has(term) && !referenceWords.has(term)),
  )].slice(0, 20)

  for (const reference of bibleReferences) {
    if (!terms.includes(reference.book.toLowerCase())) terms.push(reference.book.toLowerCase())
  }

  return { originalQuery, normalizedQuery, terms, bibleReferences }
}

export function flattenSearchableValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenSearchableValue).join(' ')
  if (value && typeof value === 'object') {
    return Object.values(value).map(flattenSearchableValue).join(' ')
  }
  return ''
}
