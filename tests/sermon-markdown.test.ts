import assert from 'node:assert/strict'
import test from 'node:test'

import { formatSermonMarkdown } from '../src/lib/sermon/markdown'
import { parseVersionInputForSave } from '../src/lib/sermon/persist'
import type { SermonDraft } from '../src/lib/sermon/types'

function sampleDraft(): SermonDraft {
  return {
    query: '작은 일도 함께',
    personalContext: '',
    coreMessage: '작은 일도 하나님께 함께 여쭙니다.',
    title: '함께 여쭈는 우리',
    estimatedMinutes: 9,
    totalChars: 2100,
    biblePassages: [],
    sections: [
      { sectionId: 'opening', heading: '마음 열기', sentences: [
        { id: 's001', type: 'transition', text: '오늘도 함께 앉았습니다.', sourceIds: [] },
        { id: 's002', type: 'application', text: '작은 일부터 함께 나눕니다.', sourceIds: [] },
      ] },
      { sectionId: 'scripture', heading: '본문 봉독', sentences: [
        { id: 's003', type: 'direct', text: '여호수아가 여리고에 가까이 이르렀을 때', sourceIds: ['B1'] },
      ] },
    ],
    questions: ['우리는 어떤 작은 일을 함께 여쭐 수 있을까요?', '오늘 감사한 일은 무엇인가요?'],
    prayer: [
      { id: 'p001', type: 'prayer', text: '하나님, 함께 여쭙는 마음을 주세요.', sourceIds: [] },
    ],
    knowledgeSources: [
      { id: 'K1', title: '이스라엘의 승리법칙', relativePath: 'bible/victory.md' } as SermonDraft['knowledgeSources'][number],
    ],
    sopSources: [
      { id: 'S1', book: '요한복음', chapter: 3, title: '거듭남' } as SermonDraft['sopSources'][number],
    ],
    provider: 'claude-code-subscription',
    model: 'claude-sonnet-5',
    promptVersion: 'sprint6-sermon-v1',
    elapsedMs: 1234,
    usage: { inputTokens: null, outputTokens: null },
  }
}

test('설교 draft를 frontmatter가 있는 Markdown으로 변환한다', () => {
  const markdown = formatSermonMarkdown(sampleDraft(), new Date('2026-07-22T00:00:00Z'))
  assert.match(markdown, /^---\n/)
  assert.match(markdown, /title: 함께 여쭈는 우리/)
  assert.match(markdown, /created: 2026-07-22/)
  assert.match(markdown, /# 함께 여쭈는 우리/)
  assert.match(markdown, /## 마음 열기/)
  assert.match(markdown, /오늘도 함께 앉았습니다\. 작은 일부터 함께 나눕니다\./)
  assert.match(markdown, /## 나눔 질문/)
  assert.match(markdown, /1\. 우리는 어떤 작은 일/)
  assert.match(markdown, /## 함께 드리는 기도/)
  assert.match(markdown, /## 사용한 자료/)
  assert.match(markdown, /- 이스라엘의 승리법칙 — bible\/victory\.md/)
  assert.match(markdown, /요한복음 3장 · 거듭남 \(예언의 신\)/)
})

test('편집 버전 입력을 검증하고 source를 web으로 채운다', () => {
  const input = parseVersionInputForSave({
    content: '# 제목\r\n\r\n본문',
    editReasons: ['tone', 'length'],
    note: '  다듬음  ',
  })
  assert.equal(input.source, 'web')
  assert.equal(input.content, '# 제목\n\n본문')
  assert.deepEqual(input.editReasons, ['tone', 'length'])
  assert.equal(input.note, '다듬음')
})

test('빈 본문은 버전으로 저장할 수 없다', () => {
  assert.throws(() => parseVersionInputForSave({ content: '   ' }), /본문이 비어/)
})
