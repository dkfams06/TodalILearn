'use client'

import type { SermonDraft, SermonSentence } from '@/lib/sermon/types'

const TYPE_LABELS: Record<SermonSentence['type'], string> = {
  direct: '성경 직접 인용',
  summary: '자료 요약',
  synthesis: '자료 연결',
  application: 'AI 적용 제안',
  transition: '흐름 연결',
  prayer: '기도',
}

function Sentence({ sentence }: { sentence: SermonSentence }) {
  return (
    <span className={`sermon-sentence sermon-${sentence.type}`}>
      {sentence.text}
      {sentence.sourceIds.length > 0 ? (
        <sup title={TYPE_LABELS[sentence.type]}>{sentence.sourceIds.join('·')}</sup>
      ) : null}{' '}
    </span>
  )
}

export function SermonView({ sermon }: { sermon: SermonDraft }) {
  return (
    <div className="sermon-output">
      <section className="core-message">
        <span>가정예배 설교 · 약 {sermon.estimatedMinutes}분 ({sermon.totalChars.toLocaleString()}자)</span>
        <h3>{sermon.title}</h3>
      </section>

      {sermon.sections.map((section) => (
        <section className="sermon-section" key={section.sectionId}>
          <h4>{section.heading}</h4>
          {section.sectionId === 'scripture' ? (
            <div className="bible-passage">
              {section.sentences.map((sentence) => (
                <p key={sentence.id}>{sentence.text}</p>
              ))}
            </div>
          ) : (
            <p className="sermon-body">
              {section.sentences.map((sentence) => (
                <Sentence key={sentence.id} sentence={sentence} />
              ))}
            </p>
          )}
        </section>
      ))}

      <section className="sermon-section">
        <h4>나눔 질문</h4>
        <ol className="research-list">
          {sermon.questions.map((question) => <li key={question}>{question}</li>)}
        </ol>
      </section>

      <section className="sermon-section sermon-prayer">
        <h4>함께 드리는 기도</h4>
        <p className="sermon-body">
          {sermon.prayer.map((sentence) => (
            <Sentence key={sentence.id} sentence={sentence} />
          ))}
        </p>
      </section>

      <section className="sermon-section">
        <h4>사용한 자료</h4>
        {sermon.knowledgeSources.length + sermon.sopSources.length === 0 ? (
          <p className="muted">외부 자료 없이 성경 본문만 사용했습니다.</p>
        ) : (
          <>
            {sermon.knowledgeSources.map((source) => (
              <details className="research-source" key={source.id}>
                <summary><span><strong>{source.id} · {source.title}</strong><small>{source.selectionReason}</small></span></summary>
                <p className="result-content">{source.excerpt}</p>
                <p className="source-locator">
                  {source.relativePath} · {source.sectionName} · 원문 {source.contentStartOffset.toLocaleString()}–{source.contentEndOffset.toLocaleString()}
                </p>
              </details>
            ))}
            {sermon.sopSources.map((source) => (
              <details className="research-source" key={source.id}>
                <summary><span><strong>{source.id} · {source.book} {source.chapter}장 · {source.title}</strong><small>{source.selectionReason}</small></span></summary>
                <p className="result-content">{source.excerpt}</p>
                <p className="source-locator">{source.book} · {source.chapter}장 · 청크 {source.chunkIndex}</p>
              </details>
            ))}
          </>
        )}
      </section>

      <p className="sermon-legend muted">
        문장 위 첨자는 근거 ID입니다. 출처 없는 문장은 AI의 적용·연결 제안이며, 성경 직접 인용은 서버가 GetBible 원문으로 검증했습니다.
      </p>
      <p className="research-meta">
        {sermon.provider} · {sermon.model} · {sermon.promptVersion} · {(sermon.elapsedMs / 1000).toFixed(1)}초
      </p>
    </div>
  )
}
