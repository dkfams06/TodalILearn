import { signOut } from '@/app/actions/auth'
import { SettingsForm } from '@/components/settings-form'
import { requireUser } from '@/lib/auth/session'
import { readLocalSettings } from '@/lib/local-settings'
import { getSystemStatus } from '@/lib/system-status'

export default async function HomePage() {
  const user = await requireUser()
  const [settings, status] = await Promise.all([
    readLocalSettings(),
    getSystemStatus(),
  ])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">연인 가정예배</p>
          <h1>설교 AI 기반 설정</h1>
        </div>
        <form action={signOut}>
          <button className="secondary" type="submit">로그아웃</button>
        </form>
      </header>

      <section className="grid">
        <article className="card">
          <h2>연결 상태</h2>
          <dl className="status-list">
            <div><dt>사용자</dt><dd>{user.email ?? user.id}</dd></div>
            <div><dt>환경변수</dt><dd>{status.environment === 'ok' ? '정상' : '확인 필요'}</dd></div>
            <div><dt>Supabase</dt><dd>{status.supabase === 'ok' ? '연결됨' : '연결 실패'}</dd></div>
            <div><dt>예언의 신 청크</dt><dd>{status.sopChunkCount?.toLocaleString() ?? '확인 불가'}</dd></div>
            <div><dt>생성 모델</dt><dd>{status.anthropicModel ?? '확인 불가'}</dd></div>
          </dl>
          {status.message ? <p className="error-message">{status.message}</p> : null}
        </article>

        <article className="card wide">
          <h2>이 PC의 옵시디언 설정</h2>
          <p className="muted">절대경로는 이 Windows PC에서만 사용합니다.</p>
          <SettingsForm initialSettings={settings} />
        </article>
      </section>
    </main>
  )
}

