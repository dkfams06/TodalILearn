'use client'

import { useEffect, useState } from 'react'

import { SermonEditor } from '@/components/sermon-editor'
import { SermonEvaluationForm } from '@/components/sermon-evaluation-form'
import { SermonVersionHistory } from '@/components/sermon-version-history'
import { SermonView } from '@/components/sermon-view'
import { getResponseError, readJsonResponse } from '@/lib/http/client'
import type {
  SavedSermon,
  SavedSermonSummary,
  SermonEvaluation,
  SermonExportJobResponse,
  SermonExportResultPayload,
  SermonVersion,
} from '@/lib/sermon/types'

type Tab = 'view' | 'edit' | 'history' | 'eval'

const TABS: { id: Tab; label: string }[] = [
  { id: 'view', label: '보기' },
  { id: 'edit', label: '편집' },
  { id: 'history', label: '버전 이력' },
  { id: 'eval', label: '평가' },
]

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function SavedSermonsPanel() {
  const [sermons, setSermons] = useState<SavedSermonSummary[]>([])
  const [selected, setSelected] = useState<SavedSermon | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('view')
  const [error, setError] = useState<string | null>(null)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingOne, setIsLoadingOne] = useState(false)
  const [baselineWorking, setBaselineWorking] = useState(false)
  const [exportWorking, setExportWorking] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadList() {
      try {
        const response = await fetch('/api/sermons')
        const body = await readJsonResponse<{ sermons: SavedSermonSummary[]; error?: string }>(response)
        if (!response.ok) throw new Error(getResponseError(body, '저장된 설교를 불러오지 못했습니다.'))
        if (cancelled) return
        setSermons(body.sermons)
        setError(null)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : '저장된 설교를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setIsLoadingList(false)
      }
    }
    void loadList()
    const handler = () => void loadList()
    window.addEventListener('sermon-saved', handler)
    return () => {
      cancelled = true
      window.removeEventListener('sermon-saved', handler)
    }
  }, [])

  async function openSermon(id: string) {
    if (selectedId === id) {
      setSelected(null)
      setSelectedId(null)
      return
    }
    setIsLoadingOne(true)
    setSelectedId(id)
    setTab('view')
    setExportError(null)
    try {
      const response = await fetch(`/api/sermons/${id}`)
      const body = await readJsonResponse<SavedSermon | { error?: string }>(response)
      if (!response.ok || !('draft' in body)) {
        throw new Error(getResponseError(body, '설교를 불러오지 못했습니다.'))
      }
      setSelected(body)
      setError(null)
    } catch (openError) {
      setSelected(null)
      setError(openError instanceof Error ? openError.message : '설교를 불러오지 못했습니다.')
    } finally {
      setIsLoadingOne(false)
    }
  }

  function applyVersions(versions: SermonVersion[]) {
    setSelected((current) => current && ({
      ...current,
      versions,
      latestMarkdown: versions[versions.length - 1]?.content ?? current.latestMarkdown,
    }))
  }

  function applyEvaluations(evaluations: SermonEvaluation[]) {
    setSelected((current) => current && ({ ...current, evaluations }))
  }

  async function waitForExportJob(jobId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000))
      const response = await fetch(`/api/jobs/${jobId}`)
      const job = await readJsonResponse<SermonExportJobResponse | { error?: string }>(response)
      if (!response.ok || !('status' in job)) {
        throw new Error(getResponseError(job, '작업 상태를 확인하지 못했습니다.'))
      }
      if (job.status === 'succeeded' && job.result) return job.result
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.error || 'Windows PC에서 작업을 완료하지 못했습니다.')
      }
    }
    throw new Error('작업 대기 시간이 초과되었습니다.')
  }

  function applyExportOutcome(id: string, outcome: SermonExportResultPayload) {
    setSelected((current) => current && current.id === id ? ({
      ...current,
      obsidianRelativePath: outcome.relativePath,
      obsidianSyncedAt: outcome.syncedAt,
    }) : current)
    setSermons((current) => current.map((item) => item.id === id ? ({
      ...item,
      obsidianRelativePath: outcome.relativePath,
      obsidianSyncedAt: outcome.syncedAt,
    }) : item))
  }

  async function exportToObsidian() {
    if (!selected) return
    setExportWorking(true)
    setExportError(null)
    try {
      const response = await fetch(`/api/sermons/${selected.id}/export`, { method: 'POST' })
      const body = await readJsonResponse<SermonExportResultPayload | SermonExportJobResponse | { error?: string }>(response)
      if (!response.ok) throw new Error(getResponseError(body, '옵시디언에 저장하지 못했습니다.'))
      const outcome = response.status === 202 && 'jobId' in body
        ? await waitForExportJob(body.jobId)
        : body as SermonExportResultPayload
      applyExportOutcome(selected.id, outcome)
    } catch (exportRequestError) {
      setExportError(exportRequestError instanceof Error ? exportRequestError.message : '옵시디언에 저장하지 못했습니다.')
    } finally {
      setExportWorking(false)
    }
  }

  async function toggleBaseline() {
    if (!selected) return
    const next = !selected.isBaseline
    setBaselineWorking(true)
    try {
      const response = await fetch(`/api/sermons/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBaseline: next }),
      })
      const body = await readJsonResponse<{ isBaseline?: boolean; error?: string }>(response)
      if (!response.ok) throw new Error(getResponseError(body, '기준 설교 설정을 바꾸지 못했습니다.'))
      setSelected((current) => current && ({ ...current, isBaseline: next }))
      setSermons((current) => current.map((item) => item.id === selected.id ? { ...item, isBaseline: next } : item))
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : '기준 설교 설정을 바꾸지 못했습니다.')
    } finally {
      setBaselineWorking(false)
    }
  }

  return (
    <article className="card wide">
      <div className="section-heading">
        <div>
          <h2>저장된 설교</h2>
          <p className="muted">만든 설교는 자동으로 저장됩니다. 제목을 눌러 다시 보고, 편집·버전·평가를 남길 수 있습니다.</p>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {isLoadingList ? (
        <p className="muted">불러오는 중…</p>
      ) : sermons.length === 0 ? (
        <p className="muted">아직 저장된 설교가 없습니다. 연구 묶음에서 설교를 만들면 여기에 쌓입니다.</p>
      ) : (
        <ul className="saved-sermon-list">
          {sermons.map((item) => (
            <li key={item.id}>
              <button
                aria-expanded={selectedId === item.id}
                className={`saved-sermon-item${selectedId === item.id ? ' active' : ''}`}
                onClick={() => void openSermon(item.id)}
                type="button"
              >
                <strong>
                  {item.isBaseline ? <span className="baseline-badge">기준</span> : null}
                  {item.title}
                </strong>
                <small>
                  {formatDate(item.createdAt)} · 약 {item.estimatedMinutes}분 · {item.query}
                  {item.obsidianSyncedAt ? ` · 옵시디언 저장됨(${formatDate(item.obsidianSyncedAt)})` : ''}
                </small>
              </button>
              {selectedId === item.id ? (
                isLoadingOne ? (
                  <p className="muted">설교를 불러오는 중…</p>
                ) : selected ? (
                  <div className="sermon-detail">
                    <div className="sermon-detail-bar">
                      <div className="tab-row" role="tablist">
                        {TABS.map((entry) => (
                          <button
                            aria-selected={tab === entry.id}
                            className={`tab${tab === entry.id ? ' active' : ''}`}
                            key={entry.id}
                            onClick={() => setTab(entry.id)}
                            role="tab"
                            type="button"
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                      <div className="detail-bar-actions">
                        <button
                          className="secondary"
                          disabled={exportWorking}
                          onClick={() => void exportToObsidian()}
                          type="button"
                        >
                          {exportWorking ? '저장 중…' : '옵시디언에 저장'}
                        </button>
                        <button
                          className={`secondary baseline-toggle${selected.isBaseline ? ' on' : ''}`}
                          disabled={baselineWorking}
                          onClick={() => void toggleBaseline()}
                          type="button"
                        >
                          {selected.isBaseline ? '★ 기준 설교' : '☆ 기준 설교로 표시'}
                        </button>
                      </div>
                    </div>

                    {selected.obsidianRelativePath ? (
                      <p className="success-message">옵시디언 폴더에 저장됨 · {selected.obsidianRelativePath}</p>
                    ) : null}
                    {exportError ? <p className="error-message">{exportError}</p> : null}

                    {tab === 'view' ? <SermonView sermon={selected.draft} /> : null}
                    {tab === 'edit' ? (
                      <SermonEditor
                        key={selected.latestMarkdown}
                        onSaved={applyVersions}
                        original={selected.latestMarkdown}
                        sermonId={selected.id}
                      />
                    ) : null}
                    {tab === 'history' ? (
                      <SermonVersionHistory
                        onChanged={applyVersions}
                        sermonId={selected.id}
                        versions={selected.versions}
                      />
                    ) : null}
                    {tab === 'eval' ? (
                      <SermonEvaluationForm
                        evaluations={selected.evaluations}
                        onEvaluated={applyEvaluations}
                        sermonId={selected.id}
                        versionNumber={selected.versions[selected.versions.length - 1]?.versionNumber ?? null}
                      />
                    ) : null}
                  </div>
                ) : null
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
