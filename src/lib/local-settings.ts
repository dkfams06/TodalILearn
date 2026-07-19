import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type LocalSettings = {
  deviceName: string
  vaultId: string
  inputFolder: string
  outputFolder: string
}

const applicationDirectoryName = 'FamilyWorshipSermonAI'

export class LocalSettingsUnavailableError extends Error {
  constructor() {
    super('Vercel에서는 Windows 경로를 저장할 수 없습니다. 이 PC의 Local Companion에서 설정해 주세요.')
    this.name = 'LocalSettingsUnavailableError'
  }
}

export function isLocalSettingsRuntime() {
  return process.platform === 'win32' && !process.env.VERCEL
}

function cleanPath(value: string | undefined) {
  const trimmed = value?.trim() ?? ''
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function getSettingsPaths() {
  if (!isLocalSettingsRuntime()) throw new LocalSettingsUnavailableError()
  const configuredDirectory = cleanPath(process.env.APP_LOCAL_CONFIG_DIR)
  const localAppData = cleanPath(process.env.LOCALAPPDATA)
  const dataDirectory = configuredDirectory || path.join(
    localAppData || path.join(os.homedir(), 'AppData', 'Local'),
    applicationDirectoryName,
  )
  return {
    dataDirectory,
    settingsPath: path.join(dataDirectory, 'config.json'),
    temporarySettingsPath: path.join(dataDirectory, 'config.json.tmp'),
  }
}

async function isDirectory(directoryPath: string) {
  if (!directoryPath) return false
  try {
    return (await stat(/*turbopackIgnore: true*/ directoryPath)).isDirectory()
  } catch {
    return false
  }
}

type ObsidianVaultRecord = {
  path?: unknown
  ts?: unknown
  open?: unknown
}

async function readObsidianVaultRoots() {
  const appData = cleanPath(process.env.APPDATA)
  if (!appData) return []

  try {
    const parsed: unknown = JSON.parse(
      await readFile(
        path.join(/*turbopackIgnore: true*/ appData, 'obsidian', 'obsidian.json'),
        'utf8',
      ),
    )
    if (!parsed || typeof parsed !== 'object') return []
    const vaults = (parsed as { vaults?: unknown }).vaults
    if (!vaults || typeof vaults !== 'object') return []

    return Object.values(vaults as Record<string, ObsidianVaultRecord>)
      .filter((vault) => typeof vault.path === 'string')
      .sort((left, right) => {
        const openDifference = Number(right.open === true) - Number(left.open === true)
        if (openDifference !== 0) return openDifference
        return Number(right.ts ?? 0) - Number(left.ts ?? 0)
      })
      .map((vault) => path.resolve(/*turbopackIgnore: true*/ cleanPath(vault.path as string)))
  } catch {
    return []
  }
}

async function discoverVaultFolders() {
  if (!isLocalSettingsRuntime()) return { inputFolder: '', outputFolder: '' }

  const configuredInput = cleanPath(process.env.OBSIDIAN_DEFAULT_INPUT_FOLDER)
  const configuredOutput = cleanPath(process.env.OBSIDIAN_DEFAULT_OUTPUT_FOLDER)
  if (await isDirectory(configuredInput)) {
    return {
      inputFolder: configuredInput,
      outputFolder: configuredOutput || path.resolve(configuredInput, '..', '..', '02 category', 'Bible', 'sermon'),
    }
  }

  const homeDirectory = os.homedir()
  const roots = [
    ...(await readObsidianVaultRoots()),
    path.join(homeDirectory, 'Documents', 'Obsidian Vault'),
    path.join(homeDirectory, 'OneDrive', 'Documents', 'Obsidian Vault'),
  ]

  for (const root of [...new Set(roots)]) {
    const inputFolder = path.join(root, '05 Raw', 'bible')
    if (await isDirectory(inputFolder)) {
      return {
        inputFolder,
        outputFolder: configuredOutput || path.join(root, '02 category', 'Bible', 'sermon'),
      }
    }
  }

  return { inputFolder: configuredInput, outputFolder: configuredOutput }
}

async function defaultSettings(): Promise<LocalSettings> {
  const discovered = await discoverVaultFolders()
  return {
    deviceName: process.env.COMPUTERNAME?.trim() || 'Windows PC',
    vaultId: process.env.OBSIDIAN_DEFAULT_VAULT_ID?.trim() || 'bible-study-main',
    inputFolder: discovered.inputFolder,
    outputFolder: discovered.outputFolder,
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
  if (!isLocalSettingsRuntime()) return defaultSettings()

  const paths = getSettingsPaths()
  let saved: LocalSettings | null = null
  try {
    const parsed: unknown = JSON.parse(
      await readFile(/*turbopackIgnore: true*/ paths.settingsPath, 'utf8'),
    )
    if (!isLocalSettings(parsed)) {
      throw new Error('로컬 설정 파일 형식이 올바르지 않습니다.')
    }
    saved = parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const defaults = await defaultSettings()
  const inputFolder = saved && await isDirectory(cleanPath(saved.inputFolder))
    ? cleanPath(saved.inputFolder)
    : defaults.inputFolder
  const outputFolder = saved && await isDirectory(cleanPath(saved.outputFolder))
    ? cleanPath(saved.outputFolder)
    : defaults.outputFolder
  const settings: LocalSettings = {
    deviceName: process.env.COMPUTERNAME?.trim() || saved?.deviceName || defaults.deviceName,
    vaultId: saved?.vaultId.trim() || defaults.vaultId,
    inputFolder,
    outputFolder,
  }

  if (!saved || JSON.stringify(saved) !== JSON.stringify(settings)) {
    await writeLocalSettings(settings)
  }
  return settings
}

export async function writeLocalSettings(settings: LocalSettings) {
  if (!isLocalSettings(settings)) {
    throw new Error('저장할 로컬 설정 형식이 올바르지 않습니다.')
  }

  const paths = getSettingsPaths()
  const normalized: LocalSettings = {
    deviceName: settings.deviceName.trim(),
    vaultId: settings.vaultId.trim(),
    inputFolder: cleanPath(settings.inputFolder),
    outputFolder: cleanPath(settings.outputFolder),
  }
  if (!normalized.deviceName || !normalized.vaultId) {
    throw new Error('PC 이름과 Vault ID가 필요합니다.')
  }
  if (!(await isDirectory(normalized.inputFolder))) {
    throw new Error(`입력 폴더를 찾지 못했습니다: ${normalized.inputFolder || '(비어 있음)'}`)
  }
  if (!normalized.outputFolder) throw new Error('완성 설교 폴더가 필요합니다.')

  await mkdir(/*turbopackIgnore: true*/ normalized.outputFolder, { recursive: true })
  await mkdir(/*turbopackIgnore: true*/ paths.dataDirectory, { recursive: true })
  await writeFile(
    /*turbopackIgnore: true*/ paths.temporarySettingsPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf8',
  )
  await rename(
    /*turbopackIgnore: true*/ paths.temporarySettingsPath,
    /*turbopackIgnore: true*/ paths.settingsPath,
  )
}

export async function autoDetectLocalSettings() {
  if (!isLocalSettingsRuntime()) throw new LocalSettingsUnavailableError()
  const settings = await defaultSettings()
  if (!settings.inputFolder) {
    throw new Error('Obsidian Vault를 자동으로 찾지 못했습니다. Obsidian에서 Vault를 한 번 열어 주세요.')
  }
  await writeLocalSettings(settings)
  return settings
}
