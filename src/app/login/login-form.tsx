'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('이메일 또는 비밀번호를 확인해 주세요.')
      setIsSubmitting(false)
      return
    }

    router.replace('/')
    router.refresh()
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        이메일
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        비밀번호
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="error-message">{error}</p> : null}
      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? '로그인 중…' : '로그인'}
      </button>
    </form>
  )
}

