import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { formatSermonMarkdown } from './markdown'

export { formatSermonMarkdown }

export type SermonExportResult = {
  relativePath: string // 출력 폴더 기준 상대경로 (예: 2026/2026-07-23 제목.md)
  fileName: string
  absolutePath: string
}

function stripControl(value: string) {
  let result = ''
  for (const char of value) {
    result += (char.codePointAt(0) ?? 0) < 0x20 ? ' ' : char
  }
  return result
}

export function sanitizeFileName(title: string) {
  // Windows에서 금지된 문자와 제어문자를 제거하고 공백을 정리한다.
  const cleaned = stripControl(title)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || '설교'
}

async function exists(absolutePath: string) {
  try {
    await access(/*turbopackIgnore: true*/ absolutePath)
    return true
  } catch {
    return false
  }
}

// 같은 연도 폴더에서 다른 설교가 같은 이름을 점유하면 " (2)"로 회피한다.
async function uniqueRelativePath(outputFolder: string, yearFolder: string, baseName: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` (${attempt + 1})`
    const fileName = `${baseName}${suffix}.md`
    const relativePath = path.posix.join(yearFolder, fileName)
    if (!(await exists(path.join(outputFolder, yearFolder, fileName)))) {
      return { relativePath, fileName }
    }
  }
  throw new Error('설교 파일 이름이 너무 많이 중복되었습니다.')
}

async function atomicWrite(absolutePath: string, markdown: string) {
  const folder = path.dirname(absolutePath)
  await mkdir(/*turbopackIgnore: true*/ folder, { recursive: true })
  const temporaryPath = path.join(folder, `.${path.basename(absolutePath)}.tmp`)
  await writeFile(/*turbopackIgnore: true*/ temporaryPath, markdown, 'utf8')
  await rename(/*turbopackIgnore: true*/ temporaryPath, absolutePath)
}

// 완성 설교 Markdown을 옵시디언 출력 폴더의 연도 하위 폴더에 저장한다.
// existingRelativePath가 있으면 그 파일을 덮어써 같은 설교가 중복 파일을 만들지 않게 한다.
// 저장은 임시 파일 후 원자적 교체라 실패해도 기존 파일이 손상되지 않는다.
export async function exportSermonToObsidian({
  outputFolder,
  title,
  markdown,
  existingRelativePath,
  createdAt = new Date(),
}: {
  outputFolder: string
  title: string
  markdown: string
  existingRelativePath?: string | null
  createdAt?: Date
}): Promise<SermonExportResult> {
  const folder = outputFolder.trim()
  if (!folder) throw new Error('완성 설교 폴더가 설정되지 않았습니다.')

  if (existingRelativePath) {
    // 제목이 바뀌어도 최초 경로를 고정해 고아·중복 파일을 막는다.
    const normalized = existingRelativePath.split(path.sep).join('/')
    const absolutePath = path.join(folder, normalized)
    await atomicWrite(absolutePath, markdown)
    return { relativePath: normalized, fileName: path.basename(normalized), absolutePath }
  }

  const yearFolder = String(createdAt.getFullYear())
  const baseName = `${createdAt.toISOString().slice(0, 10)} ${sanitizeFileName(title)}`
  const { relativePath, fileName } = await uniqueRelativePath(folder, yearFolder, baseName)
  const absolutePath = path.join(folder, yearFolder, fileName)
  await atomicWrite(absolutePath, markdown)
  return { relativePath, fileName, absolutePath }
}
