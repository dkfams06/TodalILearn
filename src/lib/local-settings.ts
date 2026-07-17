import 'server-only'

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type LocalSettings = {
  deviceName: string
  vaultId: string
  inputFolder: string
  outputFolder: string
}

const dataDirectory = path.join(process.cwd(), 'data')
const settingsPath = path.join(dataDirectory, 'local-settings.json')
const temporarySettingsPath = path.join(dataDirectory, 'local-settings.json.tmp')

function defaultSettings(): LocalSettings {
  return {
    deviceName: process.env.COMPUTERNAME?.trim() || 'Windows PC',
    vaultId: process.env.OBSIDIAN_DEFAULT_VAULT_ID?.trim() || 'bible-study-main',
    inputFolder: process.env.OBSIDIAN_DEFAULT_INPUT_FOLDER?.trim() || '',
    outputFolder: process.env.OBSIDIAN_DEFAULT_OUTPUT_FOLDER?.trim() || '',
  }
}

function isLocalSettings(value: unknown): value is LocalSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as Record<string, unknown>
  return ['deviceName', 'vaultId', 'inputFolder', 'outputFolder'].every(
    (key) => typeof settings[key] === 'string',
  )
}

export async function readLocalSettings(): Promise<LocalSettings> {
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsPath, 'utf8'))
    if (!isLocalSettings(parsed)) {
      throw new Error('로컬 설정 파일 형식이 올바르지 않습니다.')
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings()
    throw error
  }
}

export async function writeLocalSettings(settings: LocalSettings) {
  if (!isLocalSettings(settings)) {
    throw new Error('저장할 로컬 설정 형식이 올바르지 않습니다.')
  }

  await mkdir(dataDirectory, { recursive: true })
  await writeFile(temporarySettingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  await rename(temporarySettingsPath, settingsPath)
}

