'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { LocalSettings } from '@/lib/local-settings'
import type { SyncResult } from '@/lib/obsidian/sync-server'
import type { ObsidianSyncSummary } from '@/lib/obsidian/status'

export function SyncPanel({
  settings,
  summary,
}: {
  settings: LocalSettings
  summary: ObsidianSyncSummary
}) {
  const router = useRouter()
  const [isSyncing, setIsSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function syncAll() {
    setIsSyncing(true)
    setResult(null)
    setError(null)

    try {
      const response = await fetch('/api/sync', { method: 'POST' })
      const body = await response.json() as SyncResult | { error?: string }
      if (!response.ok) {
        throw new Error('error' in body && body.error ? body.error : '동기화하지 못했습니다.')
      }
      setResult(body as SyncResult)
      router.refresh()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '동기화하지 못했습니다.')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <article className="card wide">
      <div className="section-heading">
        <div>
          <h2>옵시디언 자료 동기화</h2>
          <p className="muted">원본 파일은 변경하지 않고 Supabase로만 보냅니다.</p>
        </div>
        <button disabled={isSyncing || !settings.inputFolder} onClick={syncAll} type="button">
          {isSyncing ? '동기화 중…' : '전체 동기화'}
        </button>
      </div>

      <dl className="status-list compact">
        <div><dt>입력 폴더</dt><dd>{settings.inputFolder || '설정 필요'}</dd></div>
        <div><dt>활성 문서</dt><dd>{summary.active.toLocaleString()}</dd></div>
        <div><dt>삭제 표시</dt><dd>{summary.deleted.toLocaleString()}</dd></div>
        <div><dt>실패</dt><dd>{summary.failed.toLocaleString()}</dd></div>
        <div>
          <dt>마지막 동기화</dt>
          <dd>{summary.lastSyncedAt ? new Date(summary.lastSyncedAt).toLocaleString('ko-KR') : '아직 없음'}</dd>
        </div>
      </dl>

      {result ? (
        <p className={result.failed > 0 ? 'error-message' : 'success-message'}>
          스캔 {result.scanned} · 신규 {result.created} · 수정 {result.updated} · 복구 {result.restored}
          {' · '}동일 {result.unchanged} · 삭제 {result.deleted} · 실패 {result.failed}
        </p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {result?.errors.map((item) => (
        <p className="error-message" key={item.relativePath}>
          {item.relativePath}: {item.message}
        </p>
      ))}
    </article>
  )
}
