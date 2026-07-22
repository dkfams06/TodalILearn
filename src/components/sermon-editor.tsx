'use client'

import { useState } from 'react'

import { SermonDiff } from '@/components/sermon-diff'
import { getResponseError, readJsonResponse } from '@/lib/http/client'
import { EDIT_REASON_TAGS } from '@/lib/sermon/evaluation'
import type { EditReasonTag, SermonVersion } from '@/lib/sermon/types'

export function SermonEditor({
  sermonId,
  original,
  onSaved,
}: {
  sermonId: string
  original: string
  onSaved: (versions: SermonVersion[]) => void
}) {
  const [content, setContent] = useState(original)
  const [reasons, setReasons] = useState<Set<EditReasonTag>>(new Set())
  const [note, setNote] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = content !== original

  function toggleReason(tag: EditReasonTag, checked: boolean) {
    setReasons((current) => {
      const next = new Set(current)
      if (checked) next.add(tag)
      else next.delete(tag)
      return next
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch(`/api/sermons/${sermonId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, editReasons: [...reasons], note }),
      })
      const body = await readJsonResponse<{ versions?: SermonVersion[]; error?: string }>(response)
      if (!response.ok || !body.versions) throw new Error(getResponseError(body, '버전을 저장하지 못했습니다.'))
      setSaved(true)
      setReasons(new Set())
      setNote('')
      onSaved(body.versions)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '버전을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sermon-editor">
      <p className="muted">
        생성된 설교를 Markdown으로 직접 수정합니다. 저장하면 새 버전으로 쌓이고, 원본과 이전 버전은 그대로 보존됩니다.
      </p>
      <textarea
        aria-label="설교 Markdown 편집"
        className="sermon-editor-area"
        onChange={(event) => { setContent(event.target.value); setSaved(false) }}
        rows={20}
        spellCheck={false}
        value={content}
      />

      <fieldset className="edit-reasons">
        <legend>수정 사유 (선택)</legend>
        <div className="tag-row">
          {EDIT_REASON_TAGS.map((tag) => (
            <label className="tag-chip" key={tag.value}>
              <input
                checked={reasons.has(tag.value)}
                onChange={(event) => toggleReason(tag.value, event.target.checked)}
                type="checkbox"
              />
              {tag.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={`version-note-${sermonId}`}>수정 메모 (선택)</label>
      <input
        id={`version-note-${sermonId}`}
        maxLength={2000}
        onChange={(event) => { setNote(event.target.value); setSaved(false) }}
        placeholder="예: 말투를 부드럽게 다듬음"
        value={note}
      />

      <div className="form-actions">
        <button disabled={saving || !dirty} onClick={() => void save()} type="button">
          {saving ? '저장 중…' : '이 수정본을 새 버전으로 저장'}
        </button>
        <button className="secondary" disabled={!dirty} onClick={() => setShowDiff((value) => !value)} type="button">
          {showDiff ? '변경 내용 숨기기' : '변경 내용 보기'}
        </button>
        {saved ? <span className="success-message">새 버전으로 저장됨</span> : null}
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {showDiff ? <SermonDiff after={content} before={original} /> : null}
    </div>
  )
}
