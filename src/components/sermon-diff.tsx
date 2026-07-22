'use client'

import { useMemo } from 'react'

import { diffLines } from '@/lib/sermon/diff'

const PREFIX: Record<string, string> = { add: '+', remove: '−', equal: ' ' }

export function SermonDiff({ before, after }: { before: string; after: string }) {
  const { ops, stats } = useMemo(() => diffLines(before, after), [before, after])
  const unchanged = before === after

  return (
    <div className="sermon-diff">
      <p className="diff-stats muted">
        {unchanged ? (
          '변경 없음'
        ) : (
          <>
            추가 {stats.added}줄 · 삭제 {stats.removed}줄 · 교체 {stats.changed}줄 ·
            {' '}문자 변화율 {(stats.charChangeRatio * 100).toFixed(1)}% ({stats.beforeChars.toLocaleString()}자 → {stats.afterChars.toLocaleString()}자)
          </>
        )}
      </p>
      <pre className="diff-body" aria-label="수정 전후 비교">
        {ops.map((op, index) => (
          <span className={`diff-line diff-${op.type}`} key={`${op.type}-${index}`}>
            {PREFIX[op.type]} {op.text || ' '}
          </span>
        ))}
      </pre>
    </div>
  )
}
