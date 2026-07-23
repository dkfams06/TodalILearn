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

export type SavedSermonSummary = {
  id: string
  title: string
  query: string
  coreMessage: string
  estimatedMinutes: number
  totalChars: number
  isBaseline: boolean
  obsidianRelativePath: string | null
  obsidianSyncedAt: string | null
  createdAt: string
}

export type SermonVersionSource = 'ai_generation' | 'web' | 'obsidian' | 'conflict_backup'

export type EditReasonTag =
  | 'theology'
  | 'citation'
  | 'tone'
  | 'awkward_expression'
  | 'repetition'
  | 'relationship_application'
  | 'length'
  | 'question'
  | 'prayer'
  | 'personal_preference'

export type SermonVersion = {
  id: string
  versionNumber: number
  source: SermonVersionSource
  content: string
  editReasons: EditReasonTag[]
  note: string | null
  createdAt: string
}

export type EvaluationVerdict = 'ready' | 'minor_edit' | 'major_edit' | 'reject'

export type EvaluationScores = {
  biblicalCentrality: number
  interpretationNaturalness: number
  sopRelevance: number
  knowledgeRelevance: number
  citationTrust: number
  coreClarity: number
  tone: number
  applicationBalance: number
  questionQuality: number
  prayerQuality: number
  lengthBalance: number
  usageIntent: number
}

export type SermonEvaluationInput = {
  scores: EvaluationScores
  verdict: EvaluationVerdict
  note: string | null
  versionNumber: number | null
}

export type SermonEvaluation = SermonEvaluationInput & {
  id: string
  createdAt: string
}

export type SavedSermon = SavedSermonSummary & {
  draft: SermonDraft
  latestMarkdown: string
  versions: SermonVersion[]
  evaluations: SermonEvaluation[]
}

export type SermonVersionInput = {
  content: string
  editReasons: EditReasonTag[]
  note: string | null
  source: SermonVersionSource
}

export type SermonJobResponse = {
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  result?: SermonDraft
  error?: string
}

export type SermonExportResultPayload = {
  relativePath: string
  syncedAt: string
}

export type SermonExportJobResponse = {
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  result?: SermonExportResultPayload
  error?: string
}
