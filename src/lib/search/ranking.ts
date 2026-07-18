import {
  bibleReferenceSimilarity,
  parseBibleReferences,
  type ParsedBibleReference,
} from './bible-reference'
import { normalizeSearchText } from './query'

export function matchedTerms(text: string, terms: string[]) {
  const normalized = normalizeSearchText(text)
  return terms.filter((term) => normalized.includes(normalizeSearchText(term)))
}

export function termCoverage(text: string, terms: string[]) {
  if (terms.length === 0) return 0
  return matchedTerms(text, terms).length / terms.length
}

export function exactReferenceMatch(
  queryReferences: ParsedBibleReference[],
  candidateText: string,
) {
  if (queryReferences.length === 0) return { score: 0, references: [] as string[] }
  const candidateReferences = parseBibleReferences(candidateText)
  let score = 0
  const references: string[] = []

  for (const queryReference of queryReferences) {
    const best = candidateReferences.reduce(
      (current, candidate) => Math.max(
        current,
        bibleReferenceSimilarity(queryReference, candidate),
      ),
      0,
    )
    if (best > 0) references.push(queryReference.normalized)
    score = Math.max(score, best)
  }

  return { score, references }
}

export function normalizeSemanticScore(similarity: number) {
  if (!Number.isFinite(similarity)) return 0
  return Math.max(0, Math.min(1, (similarity - 0.65) / 0.25))
}

export function roundedScore(score: number) {
  return Math.round(score * 10_000) / 10_000
}

