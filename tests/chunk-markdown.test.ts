import assert from 'node:assert/strict'
import test from 'node:test'

import { chunkMarkdown } from '../src/lib/knowledge/chunk-markdown'

test('frontmatter를 제외하고 제목·문단 경계로 청크를 만든다', () => {
  const markdown = `---
title: 테스트
---

# 큰 제목

첫 번째 문단입니다.

## 둘째 제목

두 번째 문단입니다.
`
  const chunks = chunkMarkdown(markdown)
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].sectionName, '큰 제목')
  assert.equal(chunks[1].sectionName, '둘째 제목')
  assert.equal(chunks.some((chunk) => chunk.content.includes('title: 테스트')), false)
})

test('모든 청크의 offset은 원문 slice와 정확히 일치한다', () => {
  const longParagraph = Array.from({ length: 180 }, (_, index) => `${index}번째 문장입니다.`).join(' ')
  const markdown = `# 제목\n\n${longParagraph}\n\n마지막 문단`
  const chunks = chunkMarkdown(markdown)
  assert.ok(chunks.length >= 2)
  for (const chunk of chunks) {
    assert.equal(
      markdown.slice(chunk.contentStartOffset, chunk.contentEndOffset),
      chunk.content,
    )
    assert.ok(chunk.content.length <= 1_500)
  }
})
