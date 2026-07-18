const books = [
  ['창세기', '창'], ['출애굽기', '출'], ['레위기', '레'], ['민수기', '민'], ['신명기', '신'],
  ['여호수아', '수'], ['사사기', '삿'], ['룻기', '룻'], ['사무엘상', '삼상'], ['사무엘하', '삼하'],
  ['열왕기상', '왕상'], ['열왕기하', '왕하'], ['역대상', '대상'], ['역대하', '대하'], ['에스라', '스'],
  ['느헤미야', '느'], ['에스더', '에'], ['욥기', '욥'], ['시편', '시'], ['잠언', '잠'],
  ['전도서', '전'], ['아가', '아'], ['이사야', '사'], ['예레미야', '렘'], ['예레미야애가', '애'],
  ['에스겔', '에스겔서', '겔'], ['다니엘', '단'], ['호세아', '호'], ['요엘', '욜'], ['아모스', '암'],
  ['오바댜', '옵'], ['요나', '욘'], ['미가', '미'], ['나훔', '나'], ['하박국', '합'],
  ['스바냐', '습'], ['학개', '학'], ['스가랴', '슥'], ['말라기', '말'], ['마태복음', '마'],
  ['마가복음', '막'], ['누가복음', '눅'], ['요한복음', '요'], ['사도행전', '행'], ['로마서', '롬'],
  ['고린도전서', '고전'], ['고린도후서', '고후'], ['갈라디아서', '갈'], ['에베소서', '엡'], ['빌립보서', '빌'],
  ['골로새서', '골'], ['데살로니가전서', '살전'], ['데살로니가후서', '살후'], ['디모데전서', '딤전'], ['디모데후서', '딤후'],
  ['디도서', '딛'], ['빌레몬서', '몬'], ['히브리서', '히'], ['야고보서', '약'], ['베드로전서', '벧전'],
  ['베드로후서', '벧후'], ['요한일서', '요일'], ['요한이서', '요이'], ['요한삼서', '요삼'], ['유다서', '유'],
  ['요한계시록', '계'],
] as const

const aliases = new Map<string, string>()
for (const [canonical, ...bookAliases] of books) {
  aliases.set(canonical, canonical)
  for (const alias of bookAliases) aliases.set(alias, canonical)
}

const aliasPattern = [...aliases.keys()]
  .sort((left, right) => right.length - left.length)
  .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const referencePattern = new RegExp(
  `(?<book>${aliasPattern})\\s*(?<chapter>\\d{1,3})\\s*(?:(?<chapterMarker>장)|[:：])?\\s*(?:(?<verseStart>\\d{1,3})\\s*(?:절)?(?:\\s*[-~–—]\\s*(?<verseEnd>\\d{1,3})\\s*(?:절)?)?)?`,
  'g',
)

export type ParsedBibleReference = {
  book: string
  bookNumber: number
  chapter: number
  verseStart: number | null
  verseEnd: number | null
  normalized: string
  raw: string
}

export function parseBibleReferences(input: string) {
  const references: ParsedBibleReference[] = []
  const seen = new Set<string>()

  for (const match of input.normalize('NFKC').matchAll(referencePattern)) {
    const groups = match.groups
    if (!groups) continue
    const book = aliases.get(groups.book)
    const chapter = Number.parseInt(groups.chapter, 10)
    if (!book || !Number.isInteger(chapter) || chapter < 1) continue

    const verseStart = groups.verseStart ? Number.parseInt(groups.verseStart, 10) : null
    const verseEnd = groups.verseEnd ? Number.parseInt(groups.verseEnd, 10) : verseStart
    const normalized = verseStart
      ? `${book} ${chapter}:${verseStart}${verseEnd && verseEnd !== verseStart ? `-${verseEnd}` : ''}`
      : `${book} ${chapter}장`
    if (seen.has(normalized)) continue
    seen.add(normalized)
    references.push({
      book,
      bookNumber: books.findIndex(([canonical]) => canonical === book) + 1,
      chapter,
      verseStart,
      verseEnd,
      normalized,
      raw: match[0],
    })
  }

  return references
}

export function bibleReferenceSimilarity(
  queryReference: ParsedBibleReference,
  candidateReference: ParsedBibleReference,
) {
  if (
    queryReference.book !== candidateReference.book ||
    queryReference.chapter !== candidateReference.chapter
  ) return 0

  if (queryReference.verseStart === null || candidateReference.verseStart === null) return 1
  const queryEnd = queryReference.verseEnd ?? queryReference.verseStart
  const candidateEnd = candidateReference.verseEnd ?? candidateReference.verseStart
  return queryReference.verseStart <= candidateEnd && candidateReference.verseStart <= queryEnd
    ? 1
    : 0.75
}
