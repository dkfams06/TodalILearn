import type { BiblePassage } from '@/lib/bible/getbible'

export type ResearchBiblePassage = BiblePassage & {
  id: string
  role: 'main' | 'related'
}

export type ResearchBibleFlow = {
  statement: string
  bibleIds: string[]
}

export type ResearchConnection = {
  statement: string
  sourceIds: string[]
}

export type ResearchKnowledgeSource = {
  id: string
  chunkId: string
  selected: boolean
  selectionReason: string
  title: string
  relativePath: string
  sectionName: string
  contentStartOffset: number
  contentEndOffset: number
  excerpt: string
}

export type ResearchSopSource = {
  id: string
  chunkId: string
  selected: boolean
  selectionReason: string
  book: string
  chapter: number
  title: string
  chunkIndex: number
  excerpt: string
}

export type ResearchBundle = {
  query: string
  inputType: 'bible_reference' | 'relationship' | 'social' | 'theme'
  personalContext: string
  coreMessage: string
  biblePassages: ResearchBiblePassage[]
  bibleFlow: ResearchBibleFlow[]
  connections: ResearchConnection[]
  relationshipApplications: string[]
  cautions: string[]
  knowledgeSources: ResearchKnowledgeSource[]
  sopSources: ResearchSopSource[]
  provider: 'claude-code-subscription'
  model: string
  promptVersion: string
  elapsedMs: number
  usage: {
    inputTokens: number | null
    outputTokens: number | null
  }
}

export type ResearchRequest = {
  query: string
  personalContext?: string
  selectedKnowledgeIds?: string[]
  selectedSopIds?: string[]
}

export type SavedResearchSummary = {
  id: string
  query: string
  coreMessage: string
  inputType: ResearchBundle['inputType']
  createdAt: string
}

export type SavedResearchBundle = {
  id: string
  createdAt: string
  bundle: ResearchBundle
}
