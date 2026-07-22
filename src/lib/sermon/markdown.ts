import { stringify } from 'yaml'

import type { SermonDraft, SermonSection } from './types'

// scripture 구획은 절을 줄바꿈으로, 나머지 구획은 문장을 한 문단으로 이어 읽는다.
function sectionBody(section: SermonSection) {
  if (section.sectionId === 'scripture') {
    return section.sentences.map((sentence) => sentence.text).join('\n')
  }
  return section.sentences.map((sentence) => sentence.text).join(' ')
}

// 생성된 설교 draft를 사람이 읽고 편집하는 Markdown으로 변환한다.
// 옵시디언 내보내기와 웹 버전 저장이 같은 형식을 쓰도록 순수 함수로 분리했다.
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
