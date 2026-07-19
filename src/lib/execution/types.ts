import type { ResearchBundle, ResearchRequest } from '@/lib/research/types'

export type CompanionDevice = {
  id: string
  deviceName: string
  vaultId: string
  lastSeenAt: string | null
  online: boolean
}

export type ResearchJobPayload = ResearchRequest

export type LocalJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type ResearchJobResponse = {
  jobId: string
  status: LocalJobStatus
  result?: ResearchBundle
  error?: string
}
