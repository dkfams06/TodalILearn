import type { ParsedBibleReference } from './bible-reference'

export type SearchQueryAnalysis = {
  originalQuery: string
  normalizedQuery: string
  terms: string[]
  bibleReferences: ParsedBibleReference[]
}

export type SearchSignals = {
  exactReferenceScore: number
  titleScore: number
  lexicalScore: number
  metadataScore: number
  semanticScore: number
  finalScore: number
}

export type KnowledgeSearchResult = {
  sourceType: 'obsidian'
  sourceId: string
  resourceId: string | null
  chunkId: string
  title: string
  relativePath: string
  sectionName: string
  content: string
  contentStartOffset: number
  contentEndOffset: number
  matchedTerms: string[]
  matchedReferences: string[]
  reasons: string[]
  signals: SearchSignals
}

export type SopSearchResult = {
  sourceType: 'sop'
  chunkId: string
  book: string
  chapter: number
  title: string
  chunkIndex: number
  content: string
  matchedTerms: string[]
  reasons: string[]
  signals: SearchSignals
}

export type HybridSearchResponse = {
  analysis: SearchQueryAnalysis
  knowledgeResults: KnowledgeSearchResult[]
  sopResults: SopSearchResult[]
  elapsedMs: number
  embedding: {
    model: string
    revision: string
    version: number
    dimensions: number
  }
}

