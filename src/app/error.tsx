'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error', { digest: error.digest })
  }, [error])

  return (
    <main className="centered-page">
      <section className="login-card">
        <p className="eyebrow">오류</p>
        <h1>화면을 불러오지 못했습니다.</h1>
        <p className="muted">민감한 원문과 키 정보는 오류 화면에 표시하지 않습니다.</p>
        <button onClick={reset} type="button">다시 시도</button>
      </section>
    </main>
  )
}

