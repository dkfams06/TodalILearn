'use client'

import { useState, type FormEvent } from 'react'

import type { LocalSettings } from '@/lib/local-settings'

export function SettingsForm({ initialSettings }: { initialSettings: LocalSettings }) {
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

    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })

    setStatus(response.ok ? '저장했습니다.' : '저장하지 못했습니다.')
    setIsSaving(false)
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <label>
        PC 이름
        <input
          onChange={(event) => setField('deviceName', event.target.value)}
          required
          value={settings.deviceName}
        />
      </label>
      <label>
        Vault ID
        <input
          onChange={(event) => setField('vaultId', event.target.value)}
          required
          value={settings.vaultId}
        />
      </label>
      <label>
        입력 폴더
        <input
          onChange={(event) => setField('inputFolder', event.target.value)}
          placeholder="C:\\...\\05 Raw\\bible"
          value={settings.inputFolder}
        />
      </label>
      <label>
        완성 설교 폴더
        <input
          onChange={(event) => setField('outputFolder', event.target.value)}
          placeholder="C:\\...\\완성 가정예배"
          value={settings.outputFolder}
        />
      </label>
      <div className="form-actions">
        <button disabled={isSaving} type="submit">
          {isSaving ? '저장 중…' : '로컬 설정 저장'}
        </button>
        {status ? <span className="muted">{status}</span> : null}
      </div>
    </form>
  )
}

