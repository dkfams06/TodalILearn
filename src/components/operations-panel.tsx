'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  canRetryJob,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
} from '@/lib/execution/job-utils'
import type { OperationsSnapshot } from '@/lib/execution/types'
import { getResponseError, readJsonResponse } from '@/lib/http/client'

function formatDate(value: string | null) {
  if (!value) return '기록 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function OperationsPanel() {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const loadOperations = useCallback(async () => {
    try {
      const response = await fetch('/api/operations', { cache: 'no-store' })
      const body = await readJsonResponse<OperationsSnapshot | { error?: string }>(response)
      if (!response.ok || !('jobs' in body)) {
        throw new Error(getResponseError(body, '운영 상태를 확인하지 못했습니다.'))
      }
      setSnapshot(body)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '운영 상태를 확인하지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadOperations(), 0)
    const timer = window.setInterval(() => void loadOperations(), 10_000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [loadOperations])

  async function retryJob(jobId: string) {
    setRetryingId(jobId)
    setError(null)
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' })
      const body = await readJsonResponse<{ error?: string }>(response)
      if (!response.ok) throw new Error(getResponseError(body, '작업을 다시 시도하지 못했습니다.'))
      await loadOperations()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : '작업을 다시 시도하지 못했습니다.')
    } finally {
      setRetryingId(null)
    }
  }

  const mainDevice = snapshot?.devices[0] ?? null

  return (
    <article className="card wide operations-panel">
      <div className="section-heading">
        <div>
          <h2>운영 상태</h2>
          <p className="muted">Companion과 최근 30개 작업을 10초마다 확인합니다.</p>
        </div>
        <button className="secondary" onClick={() => void loadOperations()} type="button">
          새로고침
        </button>
      </div>

      <div className="operations-summary">
        <section className="device-status">
          <span className={`status-dot ${mainDevice?.online ? 'online' : 'offline'}`} />
          <div>
            <strong>{mainDevice?.deviceName ?? '등록된 메인 PC 없음'}</strong>
            <small>
              {mainDevice
                ? `${mainDevice.online ? '온라인' : '오프라인'} · 마지막 신호 ${formatDate(mainDevice.lastSeenAt)}`
                : 'Companion을 연결해 주세요.'}
            </small>
            {mainDevice ? (
              <small>
                {mainDevice.vaultId}
                {mainDevice.companionVersion ? ` · v${mainDevice.companionVersion}` : ''}
              </small>
            ) : null}
          </div>
        </section>

        <dl className="job-counts">
          <div><dt>대기</dt><dd>{snapshot?.counts.queued ?? 0}</dd></div>
          <div><dt>실행 중</dt><dd>{snapshot?.counts.running ?? 0}</dd></div>
          <div><dt>완료</dt><dd>{snapshot?.counts.succeeded ?? 0}</dd></div>
          <div><dt>실패·취소</dt><dd>{(snapshot?.counts.failed ?? 0) + (snapshot?.counts.cancelled ?? 0)}</dd></div>
        </dl>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {!snapshot ? <p className="muted">운영 상태를 불러오는 중입니다…</p> : null}
      {snapshot && snapshot.jobs.length === 0 ? <p className="muted">아직 실행한 작업이 없습니다.</p> : null}

      {snapshot && snapshot.jobs.length > 0 ? (
        <div className="job-list">
          {snapshot.jobs.map((job) => (
            <section className="job-item" key={job.id}>
              <div className="job-main">
                <div>
                  <strong>{JOB_TYPE_LABELS[job.jobType] ?? job.jobType}</strong>
                  <span className={`job-status status-${job.status}`}>
                    {JOB_STATUS_LABELS[job.status]}
                  </span>
                </div>
                <small>
                  요청 {formatDate(job.createdAt)} · 시도 {job.attemptCount}회 · {job.id.slice(0, 8)}
                </small>
                {job.errorMessage ? <p className="job-error">{job.errorMessage}</p> : null}
              </div>
              {canRetryJob(job.status) ? (
                <button
                  disabled={retryingId === job.id || !mainDevice?.online}
                  onClick={() => void retryJob(job.id)}
                  type="button"
                >
                  {retryingId === job.id ? '재시도 중…' : '다시 시도'}
                </button>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </article>
  )
}
