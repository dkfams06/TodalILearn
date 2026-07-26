import type { LocalJobStatus, LocalJobType } from '@/lib/execution/types'

export const RETRYABLE_JOB_STATUSES: readonly LocalJobStatus[] = ['failed', 'cancelled']

export function canRetryJob(status: LocalJobStatus) {
  return RETRYABLE_JOB_STATUSES.includes(status)
}

export const JOB_STATUS_LABELS: Record<LocalJobStatus, string> = {
  queued: '대기',
  running: '실행 중',
  succeeded: '완료',
  failed: '실패',
  cancelled: '취소',
}

export const JOB_TYPE_LABELS: Record<LocalJobType, string> = {
  research: '연구 묶음',
  sermon: '설교 생성',
  sermon_export: '옵시디언 저장',
  sermon_sync: '옵시디언 동기화',
}
