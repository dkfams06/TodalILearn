import { connection } from 'next/server'

import { SettingsForm } from '@/components/settings-form'
import { ResearchPanel } from '@/components/research-panel'
import { SearchPanel } from '@/components/search-panel'
import { SyncPanel } from '@/components/sync-panel'
import { requireUser } from '@/lib/auth/session'
import { getExecutionMode } from '@/lib/execution/mode'
import { isLocalSettingsRuntime, readLocalSettings } from '@/lib/local-settings'
import { getObsidianSyncSummary } from '@/lib/obsidian/status'
import { getSystemStatus } from '@/lib/system-status'

export default async function HomePage() {
  await connection()
  const user = await requireUser()
  const localRuntime = isLocalSettingsRuntime()
  const executionMode = getExecutionMode()
  const [settings, status] = await Promise.all([
    readLocalSettings(),
    getSystemStatus(),
  ])
  const syncSummary = await getObsidianSyncSummary(user.id, settings.vaultId)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">연인 가정예배</p>
          <h1>설교 AI 기반 설정</h1>
        </div>
        <span className="muted">개인용 · 로그인 없음</span>
      </header>

      <section className="grid">
        <ResearchPanel />

        {executionMode === 'local' ? <SearchPanel /> : null}

        <article className="card">
          <h2>연결 상태</h2>
          <dl className="status-list">
            <div><dt>사용자</dt><dd>{user.email ?? 'Supabase 개인 사용자'}</dd></div>
            <div><dt>환경변수</dt><dd>{status.environment === 'ok' ? '정상' : '확인 필요'}</dd></div>
            <div><dt>Supabase</dt><dd>{status.supabase === 'ok' ? '연결됨' : '연결 실패'}</dd></div>
            <div>
              <dt>예언의 신 청크</dt>
              <dd>
                {status.sopChunkStatus === 'pending'
                  ? '가져오기 대기 (Sprint 3)'
                  : status.sopChunkCount?.toLocaleString() ?? '확인 불가'}
              </dd>
            </div>
            <div>
              <dt>Claude 구독</dt>
              <dd>
                {status.claudeSubscriptionLabel ?? '확인 불가'}
              </dd>
            </div>
            <div><dt>생성 모델</dt><dd>{status.claudeModel ?? '확인 불가'}</dd></div>
          </dl>
          {status.message ? <p className="error-message">{status.message}</p> : null}
        </article>

        {localRuntime ? (
          <>
            <SyncPanel settings={settings} summary={syncSummary} />
            <article className="card wide">
              <h2>메인 PC 옵시디언 설정</h2>
              <p className="muted">Claude Code와 파일 작업은 이 PC에서만 실행합니다.</p>
              <SettingsForm initialSettings={settings} localRuntime />
            </article>
          </>
        ) : (
          <article className="card wide">
            <h2>메인 PC 실행 방식</h2>
            <p className="muted">
              로컬 경로·Claude Code·옵시디언 저장은 항상 켜진 메인 PC의 Companion이 자동 처리합니다.
              이 브라우저에서는 별도 경로 설정이 필요 없습니다.
            </p>
          </article>
        )}
      </section>
    </main>
  )
}
