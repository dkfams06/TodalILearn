import type {
  ResearchBiblePassage,
  ResearchBundle,
  ResearchKnowledgeSource,
  ResearchSopSource,
} from '@/lib/research/types'

export type SermonSentenceType =
  | 'direct'
  | 'summary'
  | 'synthesis'
  | 'application'
  | 'transition'
  | 'prayer'

export type SermonSentence = {
  id: string
  type: SermonSentenceType
  text: string
  sourceIds: string[]
}

export type SermonSectionId =
  | 'opening'
  | 'scripture'
  | 'meditation'
  | 'connection'
  | 'application'

export type SermonSection = {
  sectionId: SermonSectionId
  heading: string
  sentences: SermonSentence[]
}

export type SermonDraft = {
  query: string
  personalContext: string
  coreMessage: string
  title: string
  estimatedMinutes: number
  totalChars: number
  biblePassages: ResearchBiblePassage[]
  sections: SermonSection[]
  questions: string[]
  prayer: SermonSentence[]
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

export type SermonRequest = {
  research: ResearchBundle
}

export type SermonJobResponse = {
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  result?: SermonDraft
  error?: string
}
