import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { stringify } from 'yaml'

import type { SermonDraft, SermonSection } from './types'

export type SermonExportResult = {
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

function sanitizeFileName(title: string) {
  // Windows에서 금지된 문자와 제어문자를 제거하고 공백을 정리한다.
  const cleaned = stripControl(title)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || '설교'
}

function sectionBody(section: SermonSection) {
  if (section.sectionId === 'scripture') {
    return section.sentences.map((sentence) => sentence.text).join('\n')
  }
  // 묵상·적용 등은 한 문단으로 이어 읽도록 문장을 공백으로 잇는다.
  return section.sentences.map((sentence) => sentence.text).join(' ')
}

export function formatSermonMarkdown(draft: SermonDraft, createdAt = new Date()) {
  const isoDate = createdAt.toISOString().slice(0, 10)
  const frontmatter = stringify({
    title: draft.title,
    type: 'sermon',
    created: isoDate,
    query: draft.query,
    core_message: draft.coreMessage,
    estimated_minutes: draft.estimatedMinutes,
    total_chars: draft.totalChars,
    model: draft.model,
    prompt_version: draft.promptVersion,
  }).trimEnd()

  const lines: string[] = [`---\n${frontmatter}\n---`, '', `# ${draft.title}`, '', `> ${draft.coreMessage}`, '']

  for (const section of draft.sections) {
    lines.push(`## ${section.heading}`, '', sectionBody(section), '')
  }

  lines.push('## 나눔 질문', '')
  draft.questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`))
  lines.push('')

  lines.push('## 함께 드리는 기도', '', draft.prayer.map((sentence) => sentence.text).join(' '), '')

  if (draft.knowledgeSources.length + draft.sopSources.length > 0) {
    lines.push('## 사용한 자료', '')
    for (const source of draft.knowledgeSources) {
      lines.push(`- ${source.title} — ${source.relativePath}`)
    }
    for (const source of draft.sopSources) {
      lines.push(`- ${source.book} ${source.chapter}장 · ${source.title} (예언의 신)`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

async function uniqueTarget(outputFolder: string, baseName: string) {
  const { access } = await import('node:fs/promises')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` (${attempt + 1})`
    const fileName = `${baseName}${suffix}.md`
    const absolutePath = path.join(outputFolder, fileName)
    try {
      await access(absolutePath)
    } catch {
      return { fileName, absolutePath }
    }
  }
  throw new Error('설교 파일 이름이 너무 많이 중복되었습니다.')
}

export async function writeSermonToObsidian({
  draft,
  outputFolder,
  createdAt = new Date(),
}: {
  draft: SermonDraft
  outputFolder: string
  createdAt?: Date
}): Promise<SermonExportResult> {
  const folder = outputFolder.trim()
  if (!folder) throw new Error('완성 설교 폴더가 설정되지 않았습니다.')

  await mkdir(folder, { recursive: true })
  const baseName = `${createdAt.toISOString().slice(0, 10)} ${sanitizeFileName(draft.title)}`
  const { fileName, absolutePath } = await uniqueTarget(folder, baseName)
  const temporaryPath = path.join(folder, `.${fileName}.tmp`)

  const markdown = formatSermonMarkdown(draft, createdAt)
  await writeFile(temporaryPath, markdown, 'utf8')
  await rename(temporaryPath, absolutePath)

  return { fileName, absolutePath }
}

// 파일 저장 실패가 설교 생성 자체를 무너뜨리지 않도록, 결과(파일명 또는 오류)를
// draft에 기록해 반환한다. 사용자는 화면에서 저장 여부를 바로 확인할 수 있다.
export async function attachObsidianExport(
  draft: SermonDraft,
  outputFolder: string,
): Promise<SermonDraft> {
  try {
    const { fileName } = await writeSermonToObsidian({ draft, outputFolder })
    return { ...draft, savedToObsidian: { fileName } }
  } catch (error) {
    const message = error instanceof Error ? error.message : '옵시디언 폴더에 저장하지 못했습니다.'
    return { ...draft, savedToObsidian: { fileName: '', error: message } }
  }
}
