'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { getResponseError, readJsonResponse } from '@/lib/http/client'
import type { LocalSettings } from '@/lib/local-settings'

type SettingsResponse = { ok: true; settings: LocalSettings } | { error?: string }

export function SettingsForm({
  initialSettings,
  localRuntime,
}: {
  initialSettings: LocalSettings
  localRuntime: boolean
}) {
  const router = useRouter()
  const [settings, setSettings] = useState(initialSettings)
  const [status, setStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function setField(field: keyof LocalSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setStatus(null)

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const body = await readJsonResponse<SettingsResponse>(response)
      if (!response.ok || !('settings' in body)) {
        throw new Error(getResponseError(body, '로컬 설정을 저장하지 못했습니다.'))
      }

      setSettings(body.settings)
      setStatus('이 PC에 저장했습니다.')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '로컬 설정을 저장하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function autoDetect() {
    setIsSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/settings', { method: 'POST' })
      const body = await readJsonResponse<SettingsResponse>(response)
      if (!response.ok || !('settings' in body)) {
        throw new Error(getResponseError(body, 'Obsidian Vault를 자동으로 찾지 못했습니다.'))
      }
      setSettings(body.settings)
      setStatus('이 PC의 Obsidian 경로를 찾아 저장했습니다.')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Obsidian Vault를 자동으로 찾지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <label>
        PC 이름
        <input
          onChange={(event) => setField('deviceName', event.target.value)}
          disabled={!localRuntime}
          required
          value={settings.deviceName}
        />
      </label>
      <label>
        Vault ID
        <input
          onChange={(event) => setField('vaultId', event.target.value)}
          disabled={!localRuntime}
          required
          value={settings.vaultId}
        />
      </label>
      <label>
        입력 폴더
        <input
          onChange={(event) => setField('inputFolder', event.target.value)}
          disabled={!localRuntime}
          placeholder="C:\\...\\05 Raw\\bible"
          value={settings.inputFolder}
        />
      </label>
      <label>
        완성 설교 폴더
        <input
          onChange={(event) => setField('outputFolder', event.target.value)}
          disabled={!localRuntime}
          placeholder="C:\\...\\완성 가정예배"
          value={settings.outputFolder}
        />
      </label>
      <div className="form-actions">
        <button disabled={isSaving || !localRuntime} type="submit">
          {isSaving ? '저장 중…' : '로컬 설정 저장'}
        </button>
        <button
          className="secondary"
          disabled={isSaving || !localRuntime}
          onClick={() => void autoDetect()}
          type="button"
        >
          이 PC에서 자동 찾기
        </button>
        {status ? <span className="muted">{status}</span> : null}
      </div>
      {!localRuntime ? (
        <p className="error-message">
          Vercel은 이 PC의 파일을 직접 저장할 수 없습니다. Local Companion 연결 후 자동 설정됩니다.
        </p>
      ) : null}
    </form>
  )
}
