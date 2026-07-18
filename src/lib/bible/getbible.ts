import type { ParsedBibleReference } from '@/lib/search/bible-reference'

export const GETBIBLE_TRANSLATION = '개역성경(1952/1961, GetBible)'
export const GETBIBLE_API_VERSION = 'v2'
export const GETBIBLE_TRANSLATION_CODE = 'korean'

export type BibleVerse = {
  verse: number
  text: string
}

export type BiblePassage = {
  reference: string
  book: string
  bookNumber: number
  chapter: number
  verseStart: number
  verseEnd: number
  translation: typeof GETBIBLE_TRANSLATION
  verses: BibleVerse[]
}

type GetBibleVerse = {
  chapter?: unknown
  verse?: unknown
  text?: unknown
}

type GetBibleChapter = {
  abbreviation?: unknown
  book_nr?: unknown
  book_name?: unknown
  chapter?: unknown
  verses?: unknown
}

export type BibleFetch = (
  input: string | URL,
  init?: RequestInit & { next?: { revalidate?: number } },
) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateChapter(value: unknown, reference: ParsedBibleReference) {
  if (!isRecord(value)) throw new Error(`${reference.normalized} GetBible 응답이 객체가 아닙니다.`)
  const chapter = value as GetBibleChapter
  if (
    chapter.abbreviation !== GETBIBLE_TRANSLATION_CODE ||
    chapter.book_nr !== reference.bookNumber ||
    chapter.chapter !== reference.chapter ||
    typeof chapter.book_name !== 'string' ||
    !Array.isArray(chapter.verses)
  ) {
    throw new Error(`${reference.normalized} GetBible 응답의 책·장 정보가 일치하지 않습니다.`)
  }

  const verses = chapter.verses.map((item, index): BibleVerse => {
    if (!isRecord(item)) throw new Error(`GetBible ${index + 1}번째 절이 객체가 아닙니다.`)
    const verse = item as GetBibleVerse
    if (
      verse.chapter !== reference.chapter ||
      typeof verse.verse !== 'number' ||
      !Number.isInteger(verse.verse) ||
      typeof verse.text !== 'string' ||
      !verse.text.trim()
    ) {
      throw new Error(`GetBible ${index + 1}번째 절 형식이 올바르지 않습니다.`)
    }
    return { verse: verse.verse, text: verse.text.trim() }
  })
  if (verses.length === 0) throw new Error(`${reference.normalized}에 성경 절이 없습니다.`)
  return verses
}

function passageFromVerses(reference: ParsedBibleReference, chapterVerses: BibleVerse[]) {
  if (reference.verseStart === null) {
    throw new Error(`${reference.normalized}은 절 범위를 포함해야 합니다.`)
  }
  const verseEnd = reference.verseEnd ?? reference.verseStart
  if (verseEnd < reference.verseStart) {
    throw new Error(`${reference.normalized}의 절 범위가 역전되었습니다.`)
  }
  const verses = chapterVerses.filter(
    (verse) => verse.verse >= reference.verseStart! && verse.verse <= verseEnd,
  )
  const expectedCount = verseEnd - reference.verseStart + 1
  if (verses.length !== expectedCount) {
    throw new Error(`${reference.normalized}의 모든 절을 GetBible에서 찾지 못했습니다.`)
  }
  return {
    reference: reference.normalized,
    book: reference.book,
    bookNumber: reference.bookNumber,
    chapter: reference.chapter,
    verseStart: reference.verseStart,
    verseEnd,
    translation: GETBIBLE_TRANSLATION,
    verses,
  } satisfies BiblePassage
}

export async function fetchBiblePassages(
  references: ParsedBibleReference[],
  fetcher: BibleFetch = globalThis.fetch as BibleFetch,
) {
  const chapterRequests = new Map<string, Promise<BibleVerse[]>>()

  for (const reference of references) {
    if (reference.verseStart === null) {
      throw new Error(`${reference.normalized}은 절 범위를 포함해야 합니다.`)
    }
    const key = `${reference.bookNumber}:${reference.chapter}`
    if (chapterRequests.has(key)) continue
    const url = `https://api.getbible.net/${GETBIBLE_API_VERSION}/${GETBIBLE_TRANSLATION_CODE}/${reference.bookNumber}/${reference.chapter}.json`
    chapterRequests.set(key, (async () => {
      const response = await fetcher(url, { next: { revalidate: 86_400 } })
      if (!response.ok) {
        throw new Error(`${reference.normalized} GetBible 조회 실패 (${response.status})`)
      }
      return validateChapter(await response.json(), reference)
    })())
  }

  return Promise.all(references.map(async (reference) => {
    const verses = await chapterRequests.get(`${reference.bookNumber}:${reference.chapter}`)
    if (!verses) throw new Error(`${reference.normalized} 장 데이터를 준비하지 못했습니다.`)
    return passageFromVerses(reference, verses)
  }))
}
