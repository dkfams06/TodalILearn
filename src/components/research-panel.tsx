'use client'

import { FormEvent, useEffect, useState } from 'react'

import { SermonView } from '@/components/sermon-view'
import type { ExecutionMode } from '@/lib/execution/mode'
import type { CompanionDevice, ResearchJobResponse } from '@/lib/execution/types'
import { getResponseError, readJsonResponse } from '@/lib/http/client'
import type {
  ResearchBundle,
  ResearchKnowledgeSource,
  ResearchSopSource,
} from '@/lib/research/types'
import type { SermonDraft, SermonJobResponse } from '@/lib/sermon/types'

type SelectionSetters = {
  knowledge: Set<string>
  sop: Set<string>
}

function EvidenceIds({ ids }: { ids: string[] }) {
  return <span className="evidence-ids">근거 {ids.join(' · ')}</span>
}

function KnowledgeSource({
  source,
  checked,
  onChange,
}: {
  source: ResearchKnowledgeSource
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <details className="research-source">
      <summary>
        <input
          aria-label={`${source.title} 선택`}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          type="checkbox"
        />
        <span><strong>{source.id} · {source.title}</strong><small>{source.selectionReason}</small></span>
      </summary>
      <p className="result-content">{source.excerpt}</p>
      <p className="source-locator">
        {source.relativePath} · {source.sectionName} · 원문 {source.contentStartOffset.toLocaleString()}–{source.contentEndOffset.toLocaleString()}
      </p>
    </details>
  )
}

function SopSource({
  source,
  checked,
  onChange,
}: {
  source: ResearchSopSource
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <details className="research-source">
      <summary>
        <input
          aria-label={`${source.title} 선택`}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          type="checkbox"
        />
        <span><strong>{source.id} · {source.title}</strong><small>{source.selectionReason}</small></span>
      </summary>
      <p className="result-content">{source.excerpt}</p>
      <p className="source-locator">
        {source.book} · {source.chapter}장 · 청크 {source.chunkIndex} · {source.chunkId}
      </p>
    </details>
  )
}

export function ResearchPanel() {
  const [query, setQuery] = useState('')
  const [personalContext, setPersonalContext] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [result, setResult] = useState<ResearchBundle | null>(null)
  const [selection, setSelection] = useState<SelectionSetters>({
    knowledge: new Set(), sop: new Set(),
  })
  const [error, setError] = useState<string | null>(null)
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('local')
  const [mainDevice, setMainDevice] = useState<CompanionDevice | null>(null)
  const [sermon, setSermon] = useState<SermonDraft | null>(null)
  const [isSermonWorking, setIsSermonWorking] = useState(false)
  const [sermonError, setSermonError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadDevices() {
      try {
        const response = await fetch('/api/devices')
        const body = await readJsonResponse<{
          mode: ExecutionMode
          devices: CompanionDevice[]
          error?: string
        }>(response)
        if (!response.ok) throw new Error(getResponseError(body, 'PC 상태를 확인하지 못했습니다.'))
        if (cancelled) return
        setExecutionMode(body.mode)
        setMainDevice(body.devices.find((device) => device.online) ?? null)
      } catch (deviceError) {
        if (!cancelled) setError(deviceError instanceof Error ? deviceError.message : 'PC 상태를 확인하지 못했습니다.')
      }
    }
    void loadDevices()
    const interval = window.setInterval(() => void loadDevices(), 15_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  async function waitForJob<Result>(jobId: string) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000))
      const response = await fetch(`/api/jobs/${jobId}`)
      const job = await readJsonResponse<
        (ResearchJobResponse | SermonJobResponse) | { error?: string }
      >(response)
      if (!response.ok || !('status' in job)) {
        throw new Error(getResponseError(job, '작업 상태를 확인하지 못했습니다.'))
      }
      if (job.status === 'succeeded' && job.result) return job.result as Result
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.error || 'Windows PC에서 작업을 완료하지 못했습니다.')
      }
    }
    throw new Error('작업 대기 시간이 초과되었습니다.')
  }

  async function requestResearch(includeSelection: boolean) {
    setIsWorking(true)
    setError(null)
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          personalContext,
          ...(includeSelection ? {
            selectedKnowledgeIds: [...selection.knowledge],
            selectedSopIds: [...selection.sop],
          } : {}),
        }),
      })
      const body = await readJsonResponse<ResearchBundle | ResearchJobResponse | { error?: string }>(response)
      if (!response.ok) {
        throw new Error(getResponseError(body, '연구 묶음을 만들지 못했습니다.'))
      }
      const bundle = response.status === 202 && 'jobId' in body
        ? await waitForJob<ResearchBundle>(body.jobId)
        : body as ResearchBundle
      setResult(bundle)
      setSermon(null)
      setSermonError(null)
      setSelection({
        knowledge: new Set(bundle.knowledgeSources.filter((source) => source.selected).map((source) => source.id)),
        sop: new Set(bundle.sopSources.filter((source) => source.selected).map((source) => source.id)),
      })
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : '연구 묶음을 만들지 못했습니다.')
    } finally {
      setIsWorking(false)
    }
  }

  async function requestSermon() {
    if (!result) return
    setIsSermonWorking(true)
    setSermonError(null)
    try {
      const response = await fetch('/api/sermon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ research: result }),
      })
      const body = await readJsonResponse<SermonDraft | SermonJobResponse | { error?: string }>(response)
      if (!response.ok) {
        throw new Error(getResponseError(body, '설교를 생성하지 못했습니다.'))
      }
      const draft = response.status === 202 && 'jobId' in body
        ? await waitForJob<SermonDraft>(body.jobId)
        : body as SermonDraft
      setSermon(draft)
    } catch (requestError) {
      setSermonError(requestError instanceof Error ? requestError.message : '설교를 생성하지 못했습니다.')
    } finally {
      setIsSermonWorking(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void requestResearch(false)
  }

  function toggle(kind: keyof SelectionSetters, id: string, checked: boolean) {
    setSelection((current) => {
      const next = new Set(current[kind])
      if (checked) next.add(id)
      else next.delete(id)
      return { ...current, [kind]: next }
    })
  }

  return (
    <article className="card wide research-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sprint 5</p>
          <h2>성경연구비서</h2>
          <p className="muted">실제 성경 본문과 원문 자료를 연결해 설교 전 단계의 연구 묶음을 만듭니다.</p>
        </div>
      </div>

      <form className="research-form" onSubmit={submit}>
        {executionMode === 'web' ? (
          <p className={mainDevice ? 'success-message' : 'error-message'}>
            메인 PC · {mainDevice ? `${mainDevice.deviceName} 온라인` : '오프라인 — Companion을 실행해 주세요.'}
          </p>
        ) : null}
        <label htmlFor="research-query">연구할 질문이나 본문</label>
        <input
          id="research-query"
          maxLength={300}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 작은 일도 하나님께 묻는 관계"
          required
          value={query}
        />
        <label htmlFor="relationship-context">두 사람의 현재 상황 (선택)</label>
        <textarea
          id="relationship-context"
          maxLength={500}
          onChange={(event) => setPersonalContext(event.target.value)}
          placeholder="예: 이번 주에 함께 결정해야 할 일이 있어요."
          rows={3}
          value={personalContext}
        />
        <div className="form-actions">
          <button
            disabled={isWorking || query.trim().length < 2 || (executionMode === 'web' && !mainDevice)}
            type="submit"
          >
            {isWorking ? '연구 중…' : '연구 묶음 만들기'}
          </button>
          <span className="muted">Claude Code 구독 호출은 보통 1~4분이 걸립니다.</span>
        </div>
      </form>

      {error ? <p className="error-message">{error}</p> : null}
      {result ? (
        <div className="research-output">
          <section className="core-message">
            <span>한 가지 핵심 메시지 · {result.inputType}</span>
            <h3>{result.coreMessage}</h3>
          </section>

          <section>
            <h3>성경 본문</h3>
            <div className="passage-grid">
              {result.biblePassages.map((passage) => (
                <article className="bible-passage" key={passage.id}>
                  <div><span>{passage.role === 'main' ? '대표 본문' : '관련 본문'}</span><strong>{passage.id} · {passage.reference}</strong></div>
                  <small>{passage.translation}</small>
                  {passage.verses.map((verse) => (
                    <p key={verse.verse}><sup>{verse.verse}</sup> {verse.text}</p>
                  ))}
                </article>
              ))}
            </div>
          </section>

          <section>
            <h3>본문 흐름</h3>
            <ol className="research-list">
              {result.bibleFlow.map((item, index) => (
                <li key={`${item.statement}-${index}`}>{item.statement} <EvidenceIds ids={item.bibleIds} /></li>
              ))}
            </ol>
          </section>

          <section>
            <h3>자료 연결</h3>
            {result.connections.length > 0 ? (
              <ul className="research-list">
                {result.connections.map((item, index) => (
                  <li key={`${item.statement}-${index}`}>{item.statement} <EvidenceIds ids={item.sourceIds} /></li>
                ))}
              </ul>
            ) : <p className="muted">선택한 외부 자료 없이 성경 본문 중심으로 구성했습니다.</p>}
          </section>

          <div className="research-columns">
            <section>
              <h3>함께 해볼 적용</h3>
              <ul className="research-list">{result.relationshipApplications.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h3>해석할 때 주의할 점</h3>
              <ul className="research-list">{result.cautions.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          </div>

          <section className="source-selection">
            <div className="section-heading">
              <div>
                <h3>사용 자료 선택</h3>
                <p className="muted">체크를 바꾸고 다시 구성하면 선택하지 않은 자료는 연구 연결에서 제외됩니다.</p>
              </div>
              <button disabled={isWorking} onClick={() => void requestResearch(true)} type="button">
                {isWorking ? '재구성 중…' : '선택 자료로 다시 구성'}
              </button>
            </div>
            <h4>옵시디언</h4>
            {result.knowledgeSources.map((source) => (
              <KnowledgeSource
                checked={selection.knowledge.has(source.id)}
                key={source.id}
                onChange={(checked) => toggle('knowledge', source.id, checked)}
                source={source}
              />
            ))}
            <h4>예언의 신</h4>
            {result.sopSources.map((source) => (
              <SopSource
                checked={selection.sop.has(source.id)}
                key={source.id}
                onChange={(checked) => toggle('sop', source.id, checked)}
                source={source}
              />
            ))}
          </section>

          <p className="research-meta">
            {result.provider} · {result.model} · {result.promptVersion} · {(result.elapsedMs / 1000).toFixed(1)}초
          </p>

          <section className="sermon-request">
            <div className="section-heading">
              <div>
                <h3>가정예배 설교</h3>
                <p className="muted">
                  지금 보이는 연구 묶음 그대로 약 10분 분량의 설교 원고를 만듭니다. 서버가 성경 인용과 자료 출처를 다시 검증합니다.
                </p>
              </div>
              <button disabled={isSermonWorking || isWorking} onClick={() => void requestSermon()} type="button">
                {isSermonWorking ? '설교 작성 중…' : '이 연구로 설교 만들기'}
              </button>
            </div>
            {sermonError ? <p className="error-message">{sermonError}</p> : null}
            {sermon ? <SermonView sermon={sermon} /> : null}
          </section>
        </div>
      ) : null}
    </article>
  )
}
