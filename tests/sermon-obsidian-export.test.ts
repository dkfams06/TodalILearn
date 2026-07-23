import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { exportSermonToObsidian, formatSermonMarkdown } from '../src/lib/sermon/obsidian-export'
import type { SermonDraft } from '../src/lib/sermon/types'

function draft(overrides: Partial<SermonDraft> = {}): SermonDraft {
  return {
    query: '작은 일도 하나님께 묻는 관계',
    personalContext: '',
    coreMessage: '작은 결정도 함께 하나님께 여쭙는 관계가 순종의 시작이다.',
    title: '작은 일도 함께 여쭈어요',
    estimatedMinutes: 9,
    totalChars: 2400,
    biblePassages: [{
      id: 'B1', role: 'main', reference: '여호수아 5:13-15', book: '여호수아', bookNumber: 6,
      chapter: 5, verseStart: 13, verseEnd: 15, translation: '개역성경(1952/1961, GetBible)',
      verses: [{ verse: 13, text: '여호수아가 여리고에 가까왔을 때에' }],
    }],
    sections: [
      { sectionId: 'opening', heading: '마음 열기', sentences: [{ id: 's001', type: 'transition', text: '오늘 우리는 함께 앉았습니다.', sourceIds: [] }] },
      { sectionId: 'scripture', heading: '본문 봉독 · 여호수아 5:13-15', sentences: [{ id: 's002', type: 'direct', text: '13. 여호수아가 여리고에 가까왔을 때에', sourceIds: ['B1'] }] },
      { sectionId: 'meditation', heading: '본문 묵상', sentences: [
        { id: 's003', type: 'summary', text: '여호수아는 주님을 먼저 만납니다.', sourceIds: ['B1'] },
        { id: 's004', type: 'transition', text: '우리의 하루도 그렇습니다.', sourceIds: [] },
      ] },
    ],
    questions: ['오늘 신을 벗어야 할 자리는 어디인가요?', '함께 여쭙고 싶은 결정은 무엇인가요?'],
    prayer: [{ id: 's005', type: 'prayer', text: '주님, 작은 일에도 함께해 주세요.', sourceIds: [] }],
    knowledgeSources: [{
      id: 'K1', chunkId: 'c1', selected: true, selectionReason: '순종을 설명한다.',
      title: '이스라엘의 승리법칙', relativePath: 'a.md', sectionName: '본문',
      contentStartOffset: 0, contentEndOffset: 5, excerpt: '순종',
    }],
    sopSources: [],
    provider: 'claude-code-subscription',
    model: 'claude-sonnet-5',
    promptVersion: 'sprint6-sermon-v1',
    elapsedMs: 1000,
    usage: { inputTokens: null, outputTokens: null },
    ...overrides,
  }
}

test('설교 Markdown에 frontmatter와 모든 구획이 포함된다', () => {
  const markdown = formatSermonMarkdown(draft(), new Date('2026-07-22T00:00:00Z'))
  assert.match(markdown, /^---\n/)
  assert.match(markdown, /title: 작은 일도 함께 여쭈어요/)
  assert.match(markdown, /created: 2026-07-22/)
  assert.match(markdown, /# 작은 일도 함께 여쭈어요/)
  assert.match(markdown, /## 본문 봉독 · 여호수아 5:13-15/)
  assert.match(markdown, /13\. 여호수아가 여리고에 가까왔을 때에/)
  assert.match(markdown, /## 나눔 질문/)
  assert.match(markdown, /1\. 오늘 신을 벗어야 할 자리는 어디인가요\?/)
  assert.match(markdown, /## 함께 드리는 기도/)
  assert.match(markdown, /## 사용한 자료/)
  assert.match(markdown, /이스라엘의 승리법칙 — a\.md/)
})

test('최초 저장은 연도 폴더 아래 파일을 원자적으로 만든다', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'sermon-export-'))
  const markdown = formatSermonMarkdown(draft(), new Date('2026-07-22T00:00:00Z'))
  const result = await exportSermonToObsidian({
    outputFolder: folder,
    title: draft().title,
    markdown,
    createdAt: new Date('2026-07-22T00:00:00Z'),
  })
  assert.equal(result.relativePath, '2026/2026-07-22 작은 일도 함께 여쭈어요.md')
  assert.equal(result.fileName, '2026-07-22 작은 일도 함께 여쭈어요.md')

  const saved = await readFile(result.absolutePath, 'utf8')
  assert.match(saved, /# 작은 일도 함께 여쭈어요/)

  const entries = await readdir(path.join(folder, '2026'))
  assert.equal(entries.filter((name) => name.endsWith('.tmp')).length, 0)
})

test('같은 설교(existingRelativePath 지정)는 같은 파일을 덮어써 중복이 생기지 않는다', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'sermon-export-'))
  const createdAt = new Date('2026-07-22T00:00:00Z')
  const first = await exportSermonToObsidian({
    outputFolder: folder,
    title: '작은 일도 함께 여쭈어요',
    markdown: formatSermonMarkdown(draft(), createdAt),
    createdAt,
  })

  const editedMarkdown = formatSermonMarkdown(draft({ title: '편집된 제목' }), createdAt)
  const second = await exportSermonToObsidian({
    outputFolder: folder,
    title: '작은 일도 함께 여쭈어요', // 제목이 바뀌어도 경로는 고정
    markdown: editedMarkdown,
    existingRelativePath: first.relativePath,
    createdAt,
  })

  assert.equal(second.relativePath, first.relativePath)
  assert.equal(second.absolutePath, first.absolutePath)

  const entries = await readdir(path.join(folder, '2026'))
  assert.equal(entries.length, 1)
  const saved = await readFile(second.absolutePath, 'utf8')
  assert.match(saved, /# 편집된 제목/)
})

test('다른 설교가 같은 이름을 쓰면 새 이름으로 회피한다', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'sermon-export-'))
  const createdAt = new Date('2026-07-22T00:00:00Z')
  const markdown = formatSermonMarkdown(draft(), createdAt)

  const first = await exportSermonToObsidian({ outputFolder: folder, title: draft().title, markdown, createdAt })
  const second = await exportSermonToObsidian({ outputFolder: folder, title: draft().title, markdown, createdAt })

  assert.notEqual(second.relativePath, first.relativePath)
  assert.equal(second.fileName, '2026-07-22 작은 일도 함께 여쭈어요 (2).md')

  const entries = await readdir(path.join(folder, '2026'))
  assert.equal(entries.length, 2)
})

test('파일명에서 Windows 금지 문자를 제거한다', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'sermon-export-'))
  const title = '진리: 안다 / 산다 * "함께"?'
  const result = await exportSermonToObsidian({
    outputFolder: folder,
    title,
    markdown: formatSermonMarkdown(draft({ title }), new Date('2026-07-22T00:00:00Z')),
    createdAt: new Date('2026-07-22T00:00:00Z'),
  })
  assert.ok(!/[\\/:*?"<>|]/.test(result.fileName.replace(/\.md$/, '')))
  await writeFile(path.join(folder, 'marker'), 'ok', 'utf8')
})
