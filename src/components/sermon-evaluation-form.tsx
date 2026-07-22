'use client'

import { useState } from 'react'

import { getResponseError, readJsonResponse } from '@/lib/http/client'
import { EVALUATION_ITEMS, EVALUATION_VERDICTS } from '@/lib/sermon/evaluation'
import type { EvaluationScores, EvaluationVerdict, SermonEvaluation } from '@/lib/sermon/types'

const VERDICT_LABEL = new Map(EVALUATION_VERDICTS.map((item) => [item.value, item.label]))

function emptyScores(): EvaluationScores {
  return Object.fromEntries(EVALUATION_ITEMS.map((item) => [item.key, 3])) as EvaluationScores
}

function averageScore(scores: EvaluationScores) {
  const values = EVALUATION_ITEMS.map((item) => scores[item.key])
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function SermonEvaluationForm({
  sermonId,
  versionNumber,
  evaluations,
  onEvaluated,
}: {
  sermonId: string
  versionNumber: number | null
  evaluations: SermonEvaluation[]
  onEvaluated: (evaluations: SermonEvaluation[]) => void
}) {
  const [scores, setScores] = useState<EvaluationScores>(emptyScores)
  const [verdict, setVerdict] = useState<EvaluationVerdict>('minor_edit')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setScore(key: keyof EvaluationScores, value: number) {
    setScores((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/sermons/${sermonId}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores, verdict, note, versionNumber }),
      })
      const body = await readJsonResponse<{ evaluation?: SermonEvaluation; error?: string }>(response)
      if (!response.ok || !body.evaluation) throw new Error(getResponseError(body, '평가를 저장하지 못했습니다.'))
      onEvaluated([body.evaluation, ...evaluations])
      setScores(emptyScores())
      setVerdict('minor_edit')
      setNote('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '평가를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sermon-evaluation">
      <p className="muted">각 항목을 1~5점으로 평가하고 전체 판정을 남기면, 프롬프트 개선의 기준 자료가 됩니다.</p>

      <div className="eval-grid">
        {EVALUATION_ITEMS.map((item) => (
          <div className="eval-row" key={item.key}>
            <span>{item.label}</span>
            <div className="score-row" role="radiogroup" aria-label={item.label}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-checked={scores[item.key] === value}
                  className={`score-dot${scores[item.key] === value ? ' active' : ''}`}
                  key={value}
                  onClick={() => setScore(item.key, value)}
                  role="radio"
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <label htmlFor={`verdict-${sermonId}`}>전체 판정</label>
      <select
        id={`verdict-${sermonId}`}
        onChange={(event) => setVerdict(event.target.value as EvaluationVerdict)}
        value={verdict}
      >
        {EVALUATION_VERDICTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>

      <label htmlFor={`eval-note-${sermonId}`}>메모 (선택)</label>
      <input
        id={`eval-note-${sermonId}`}
        maxLength={2000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="예: 기도문이 특히 자연스러웠음"
        value={note}
      />

      <div className="form-actions">
        <button disabled={saving} onClick={() => void save()} type="button">
          {saving ? '저장 중…' : '평가 저장'}
        </button>
        <span className="muted">평균 {averageScore(scores)}점</span>
      </div>
      {error ? <p className="error-message">{error}</p> : null}

      {evaluations.length > 0 ? (
        <div className="eval-history">
          <h4>평가 이력</h4>
          <ul className="research-list">
            {evaluations.map((evaluation) => (
              <li key={evaluation.id}>
                <span className={`verdict-badge verdict-${evaluation.verdict}`}>{VERDICT_LABEL.get(evaluation.verdict)}</span>
                {' '}평균 {averageScore(evaluation.scores)}점 · {formatDate(evaluation.createdAt)}
                {evaluation.versionNumber ? ` · v${evaluation.versionNumber}` : ''}
                {evaluation.note ? <small className="muted"> — {evaluation.note}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
