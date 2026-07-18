import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { discoverMarkdownFiles, readMarkdownFile } from '../src/lib/obsidian/files'
import { parseMarkdownFrontmatter } from '../src/lib/obsidian/frontmatter'

test('Markdown 재귀 탐색과 상대경로 정규화', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bible-study-files-'))
  try {
    await mkdir(path.join(root, '하위'), { recursive: true })
    await writeFile(path.join(root, '첫.md'), '# 첫 문서\n', 'utf8')
    await writeFile(path.join(root, '하위', '둘.MD'), '# 둘째 문서\n', 'utf8')
    await writeFile(path.join(root, '무시.txt'), 'ignore', 'utf8')

    const files = await discoverMarkdownFiles(root)
    assert.deepEqual(files.map((file) => file.relativePath).sort(), ['첫.md', '하위/둘.MD'].sort())
    assert.equal(files.every((file) => !file.relativePath.includes('\\')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('원본 바이트 SHA-256은 동일 파일에 재현 가능하다', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bible-study-hash-'))
  try {
    await writeFile(path.join(root, 'sample.md'), '# 내용\r\n둘째 줄\r\n', 'utf8')
    const [file] = await discoverMarkdownFiles(root)
    const first = await readMarkdownFile(file)
    const second = await readMarkdownFile(file)
    assert.equal(first.contentHash, second.contentHash)
    assert.equal(first.rawMarkdown, '# 내용\r\n둘째 줄\r\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('YAML frontmatter 전체 값과 주요 필드를 파싱한다', () => {
  const parsed = parseMarkdownFrontmatter(`---
title: "테스트 설교"
url: https://example.com/video
channel: 교회
published: 2026-07-18
tags: [youtube, transcript]
---
# 본문
`)

  assert.equal(parsed.title, '테스트 설교')
  assert.equal(parsed.url, 'https://example.com/video')
  assert.equal(parsed.channel, '교회')
  assert.equal(parsed.publishedAt, '2026-07-18')
  assert.deepEqual(parsed.values.tags, ['youtube', 'transcript'])
})

test('잘못된 YAML과 날짜는 해당 문서 오류가 된다', () => {
  assert.throws(
    () => parseMarkdownFrontmatter('---\ntitle: [닫히지 않음\n---\n본문'),
    /YAML frontmatter 오류/,
  )
  assert.throws(
    () => parseMarkdownFrontmatter('---\npublished: 2026-02-30\n---\n본문'),
    /published 날짜가 올바르지 않습니다/,
  )
})
