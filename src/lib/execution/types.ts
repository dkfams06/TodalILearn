import type { ChatMessage } from '@/lib/chat/types'
import type { ResearchBundle, ResearchRequest } from '@/lib/research/types'

export type CompanionDevice = {
  id: string
  deviceName: string
  vaultId: string
  lastSeenAt: string | null
  online: boolean
  capabilities?: string[]
  companionVersion?: string
}

export type ResearchJobPayload = ResearchRequest

export type LocalJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type LocalJobType = 'research' | 'sermon' | 'sermon_export' | 'sermon_sync' | 'chat'

export type LocalJobSummary = {
  id: string
  deviceId: string
  jobType: LocalJobType
  status: LocalJobStatus
  attemptCount: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type OperationsSnapshot = {
  generatedAt: string
  devices: CompanionDevice[]
  jobs: LocalJobSummary[]
  counts: Record<LocalJobStatus, number>
}

export type ResearchJobResponse = {
  jobId: string
  status: LocalJobStatus
  result?: ResearchBundle
  error?: string
}

export type ChatJobResponse = {
  jobId: string
  status: LocalJobStatus
  result?: ChatMessage
  error?: string
}
