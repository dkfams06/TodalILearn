'use client'

import { FormEvent, useState } from 'react'

import { getResponseError, readJsonResponse } from '@/lib/http/client'
import type {
  HybridSearchResponse,
  KnowledgeSearchResult,
  SearchSignals,
  SopSearchResult,
} from '@/lib/search/types'

function SignalSummary({ signals }: { signals: SearchSignals }) {
  return (
    <span className="signal-summary">
      최종 {signals.finalScore.toFixed(2)} · 본문 {signals.exactReferenceScore.toFixed(2)}
      {' · '}텍스트 {signals.lexicalScore.toFixed(2)} · 메타 {signals.metadataScore.toFixed(2)}
      {' · '}의미 {signals.semanticScore.toFixed(3)}
    </span>
  )
}

function ReasonList({ reasons }: { reasons: string[] }) {
  return (
    <div className="reason-list">
      {reasons.map((reason) => <span className="reason-chip" key={reason}>{reason}</span>)}
    </div>
  )
}

function KnowledgeResult({ result, rank }: { result: KnowledgeSearchResult; rank: number }) {
  return (
    <details className="search-result">
      <summary>
        <span className="result-rank">{rank}</span>
        <span>
          <strong>{result.title}</strong>
          <small>{result.sectionName}</small>
        </span>
      </summary>
      <ReasonList reasons={result.reasons} />
      <p className="result-content">{result.content}</p>
      <div className="result-meta">
        <span>{result.relativePath}</span>
        <span>원문 {result.contentStartOffset.toLocaleString()}–{result.contentEndOffset.toLocaleString()}</span>
      </div>
      {result.matchedReferences.length > 0 ? (
        <p className="matched-line">본문: {result.matchedReferences.join(', ')}</p>
      ) : null}
      {result.matchedTerms.length > 0 ? (
        <p className="matched-line">핵심어: {result.matchedTerms.join(', ')}</p>
      ) : null}
      <SignalSummary signals={result.signals} />
    </details>
  )
}

function SopResult({ result, rank }: { result: SopSearchResult; rank: number }) {
  return (
    <details className="search-result">
      <summary>
        <span className="result-rank">{rank}</span>
        <span>
          <strong>{result.title}</strong>
          <small>{result.book} · {result.chapter}장 · 청크 {result.chunkIndex}</small>
        </span>
      </summary>
      <ReasonList reasons={result.reasons} />
      <p className="result-content">{result.content}</p>
      {result.matchedTerms.length > 0 ? (
        <p className="matched-line">핵심어: {result.matchedTerms.join(', ')}</p>
      ) : null}
      <SignalSummary signals={result.signals} />
    </details>
  )
}

export function SearchPanel() {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [result, setResult] = useState<HybridSearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const body = await readJsonResponse<HybridSearchResponse | { error?: string }>(response)
      if (!response.ok) {
        throw new Error(getResponseError(body, '검색하지 못했습니다.'))
      }
      setResult(body as HybridSearchResponse)
    } catch (searchError) {
      setResult(null)
      setError(searchError instanceof Error ? searchError.message : '검색하지 못했습니다.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <article className="card wide search-card">
      <div className="section-heading">
        <div>
          <h2>자료 하이브리드 검색</h2>
          <p className="muted">성경 본문·주제·인물·사건으로 옵시디언과 예언의 신 원문을 함께 찾습니다.</p>
        </div>
      </div>

      <form className="search-form" onSubmit={search}>
        <label htmlFor="hybrid-query">연구할 질문이나 본문</label>
        <div className="search-input-row">
          <input
            id="hybrid-query"
            maxLength={300}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 다니엘 7장의 작은 뿔은 무엇을 의미하는가"
            required
            value={query}
          />
          <button disabled={isSearching || query.trim().length < 2} type="submit">
            {isSearching ? '검색 중…' : '자료 검색'}
          </button>
        </div>
      </form>

      {isSearching ? <p className="muted">첫 검색은 로컬 E5 모델을 불러오느라 조금 더 걸릴 수 있습니다.</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      {result ? (
        <div className="search-output">
          <div className="search-analysis">
            <span>{result.elapsedMs.toLocaleString()}ms</span>
            <span>핵심어 {result.analysis.terms.join(', ') || '없음'}</span>
            <span>
              본문 {result.analysis.bibleReferences.map((reference) => reference.normalized).join(', ') || '없음'}
            </span>
          </div>

          <section>
            <h3>옵시디언 자료 <span>{result.knowledgeResults.length}</span></h3>
            {result.knowledgeResults.length > 0 ? result.knowledgeResults.map((item, index) => (
              <KnowledgeResult key={item.chunkId} rank={index + 1} result={item} />
            )) : <p className="muted">관련 자료를 찾지 못했습니다.</p>}
          </section>

          <section>
            <h3>예언의 신 <span>{result.sopResults.length}</span></h3>
            {result.sopResults.length > 0 ? result.sopResults.map((item, index) => (
              <SopResult key={item.chunkId} rank={index + 1} result={item} />
            )) : <p className="muted">관련 문단을 찾지 못했습니다.</p>}
          </section>
        </div>
      ) : null}
    </article>
  )
}
