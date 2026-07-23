'use client'

import { useState } from 'react'

import { SermonDiff } from '@/components/sermon-diff'
import { getResponseError, readJsonResponse } from '@/lib/http/client'
import { EDIT_REASON_TAGS } from '@/lib/sermon/evaluation'
import type { EditReasonTag, SermonVersion } from '@/lib/sermon/types'
import { currentVersion } from '@/lib/sermon/version-utils'

const SOURCE_LABELS: Record<SermonVersion['source'], string> = {
  ai_generation: 'AI 생성',
  web: '웹 편집',
  obsidian: '옵시디언',
  conflict_backup: '충돌 백업',
}

const REASON_LABEL = new Map(EDIT_REASON_TAGS.map((tag) => [tag.value, tag.label]))

function reasonLabels(reasons: EditReasonTag[]) {
  return reasons.map((reason) => REASON_LABEL.get(reason) ?? reason).join(', ')
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function SermonVersionHistory({
  sermonId,
  versions,
  onChanged,
}: {
  sermonId: string
  versions: SermonVersion[]
  onChanged: (versions: SermonVersion[]) => void
}) {
  // "현재 버전" 배지는 conflict_backup을 제외한 대표 버전을 기준으로 판정한다.
  // 충돌 백업이 버전 번호상 최신이어도 대표 버전으로 오인 표시하지 않는다.
  const latest = currentVersion(versions)
  const latestNumber = latest?.versionNumber ?? 1
  const latestIndex = versions.findIndex((version) => version.versionNumber === latestNumber)
  const previousNumber = latestIndex > 0 ? versions[latestIndex - 1].versionNumber : latestNumber

  const [baseNumber, setBaseNumber] = useState(previousNumber)
  const [targetNumber, setTargetNumber] = useState(latestNumber)
  const [pinnedLatest, setPinnedLatest] = useState(latestNumber)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 새 버전이 저장되면(최신 번호가 바뀌면) 비교 대상을 최신 두 버전으로 되돌린다.
  // 렌더 중 상태 조정은 effect보다 권장되는 패턴이다.
  if (latestNumber !== pinnedLatest) {
    setPinnedLatest(latestNumber)
    setTargetNumber(latestNumber)
    setBaseNumber(previousNumber)
  }

  const base = versions.find((version) => version.versionNumber === baseNumber)
  const target = versions.find((version) => version.versionNumber === targetNumber)

  async function restore(version: SermonVersion) {
    setRestoring(version.versionNumber)
    setError(null)
    try {
      const response = await fetch(`/api/sermons/${sermonId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: version.content, editReasons: [], note: `v${version.versionNumber} 복원` }),
      })
      const body = await readJsonResponse<{ versions?: SermonVersion[]; error?: string }>(response)
      if (!response.ok || !body.versions) throw new Error(getResponseError(body, '버전을 복원하지 못했습니다.'))
      onChanged(body.versions)
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '버전을 복원하지 못했습니다.')
    } finally {
      setRestoring(null)
    }
  }

  if (versions.length === 0) return <p className="muted">아직 버전이 없습니다.</p>

  return (
    <div className="version-history">
      <ol className="version-list">
        {[...versions].reverse().map((version) => (
          <li className="version-item" key={version.id}>
            <div>
              <strong>v{version.versionNumber}</strong>
              <span className="version-source">{SOURCE_LABELS[version.source]}</span>
              <small className="muted"> · {formatDate(version.createdAt)}</small>
            </div>
            {version.editReasons.length > 0 ? <small className="muted">사유: {reasonLabels(version.editReasons)}</small> : null}
            {version.note ? <small className="muted">메모: {version.note}</small> : null}
            {version.versionNumber !== latest?.versionNumber ? (
              <button
                className="secondary version-restore"
                disabled={restoring !== null}
                onClick={() => void restore(version)}
                type="button"
              >
                {restoring === version.versionNumber ? '복원 중…' : '이 버전 복원'}
              </button>
            ) : (
              <span className="version-current">현재 버전</span>
            )}
          </li>
        ))}
      </ol>

      {error ? <p className="error-message">{error}</p> : null}

      {versions.length > 1 ? (
        <div className="version-compare">
          <div className="compare-controls">
            <label>
              기준
              <select onChange={(event) => setBaseNumber(Number(event.target.value))} value={baseNumber}>
                {versions.map((version) => <option key={version.id} value={version.versionNumber}>v{version.versionNumber}</option>)}
              </select>
            </label>
            <span aria-hidden>→</span>
            <label>
              비교
              <select onChange={(event) => setTargetNumber(Number(event.target.value))} value={targetNumber}>
                {versions.map((version) => <option key={version.id} value={version.versionNumber}>v{version.versionNumber}</option>)}
              </select>
            </label>
          </div>
          {base && target ? <SermonDiff after={target.content} before={base.content} /> : null}
        </div>
      ) : null}
    </div>
  )
}
