'use client'

import { useEffect, useState } from 'react'

import { SermonView } from '@/components/sermon-view'
import { getResponseError, readJsonResponse } from '@/lib/http/client'
import type { SavedSermon, SavedSermonSummary } from '@/lib/sermon/types'

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
  const [error, setError] = useState<string | null>(null)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingOne, setIsLoadingOne] = useState(false)

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

  return (
    <article className="card wide">
      <div className="section-heading">
        <div>
          <h2>저장된 설교</h2>
          <p className="muted">만든 설교는 자동으로 저장됩니다. 제목을 눌러 다시 볼 수 있습니다.</p>
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
                <strong>{item.title}</strong>
                <small>{formatDate(item.createdAt)} · 약 {item.estimatedMinutes}분 · {item.query}</small>
              </button>
              {selectedId === item.id ? (
                isLoadingOne ? (
                  <p className="muted">설교를 불러오는 중…</p>
                ) : selected ? (
                  <SermonView sermon={selected.draft} />
                ) : null
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
