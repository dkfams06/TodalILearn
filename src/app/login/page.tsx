import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')

  return (
    <main className="centered-page">
      <section className="login-card">
        <p className="eyebrow">개인용 성경연구비서</p>
        <h1>가정예배 설교 AI</h1>
        <p className="muted">기존 만나앱의 Supabase 계정으로 로그인하세요.</p>
        <LoginForm />
      </section>
    </main>
  )
}

