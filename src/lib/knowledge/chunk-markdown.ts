import { getMarkdownBodyStart } from '@/lib/obsidian/frontmatter'

export type MarkdownChunk = {
  chunkIndex: number
  sectionName: string
  content: string
  contentStartOffset: number
  contentEndOffset: number
}

type TextBlock = {
  start: number
  end: number
  sectionName: string
  isHeading: boolean
}

const maximumChunkLength = 1_500
const targetChunkLength = 1_100
const minimumSplitLength = 600

function trimRange(markdown: string, start: number, end: number) {
  while (start < end && /\s/.test(markdown[start])) start += 1
  while (end > start && /\s/.test(markdown[end - 1])) end -= 1
  return { start, end }
}

function splitLongRange(markdown: string, start: number, end: number) {
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = start

  while (end - cursor > maximumChunkLength) {
    const hardEnd = cursor + maximumChunkLength
    const search = markdown.slice(cursor + minimumSplitLength, hardEnd)
    const boundaryPattern = /[.!?。！？]["'”’)]*(?=\s)/g
    let boundary = -1
    for (const match of search.matchAll(boundaryPattern)) {
      const candidate = cursor + minimumSplitLength + (match.index ?? 0) + match[0].length
      if (candidate <= cursor + targetChunkLength) boundary = candidate
      else if (boundary === -1) boundary = candidate
    }

    if (boundary === -1) {
      const newline = markdown.lastIndexOf('\n', hardEnd)
      boundary = newline >= cursor + minimumSplitLength ? newline : hardEnd
    }

    const range = trimRange(markdown, cursor, boundary)
    if (range.end > range.start) ranges.push(range)
    cursor = boundary
  }

  const last = trimRange(markdown, cursor, end)
  if (last.end > last.start) ranges.push(last)
  return ranges
}

function markdownBlocks(markdown: string): TextBlock[] {
  const bodyStart = getMarkdownBodyStart(markdown)
  const blocks: TextBlock[] = []
  let blockStart: number | null = null
  let blockEnd = bodyStart
  let sectionName = '본문'
  const linePattern = /[^\r\n]*(?:\r\n|\n|$)/g
  linePattern.lastIndex = bodyStart

  function flushBlock() {
    if (blockStart == null) return
    const range = trimRange(markdown, blockStart, blockEnd)
    if (range.end <= range.start) {
      blockStart = null
      return
    }
    const firstLine = markdown.slice(range.start, range.end).split(/\r?\n/, 1)[0]
    const heading = firstLine.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (heading) sectionName = heading[1].trim()
    blocks.push({
      start: range.start,
      end: range.end,
      sectionName,
      isHeading: Boolean(heading),
    })
    blockStart = null
  }

  for (const match of markdown.matchAll(linePattern)) {
    const lineStart = match.index ?? 0
    if (lineStart < bodyStart) continue
    const fullLine = match[0]
    if (!fullLine) break
    const lineWithoutEnding = fullLine.replace(/\r?\n$/, '')
    if (!lineWithoutEnding.trim()) {
      flushBlock()
      continue
    }
    if (blockStart == null) blockStart = lineStart
    blockEnd = lineStart + lineWithoutEnding.length
  }
  flushBlock()
  return blocks
}

export function chunkMarkdown(markdown: string): MarkdownChunk[] {
  const blocks = markdownBlocks(markdown)
  const ranges: Array<{ start: number; end: number; sectionName: string }> = []
  let pending: { start: number; end: number; sectionName: string } | null = null

  function flushPending() {
    if (!pending) return
    ranges.push(pending)
    pending = null
  }

  for (const block of blocks) {
    if (block.isHeading) flushPending()

    if (block.end - block.start > maximumChunkLength) {
      flushPending()
      for (const range of splitLongRange(markdown, block.start, block.end)) {
        ranges.push({ ...range, sectionName: block.sectionName })
      }
      continue
    }

    if (!pending) {
      pending = { start: block.start, end: block.end, sectionName: block.sectionName }
      continue
    }

    const sameSection = pending.sectionName === block.sectionName
    if (sameSection && block.end - pending.start <= maximumChunkLength) {
      pending.end = block.end
    } else {
      flushPending()
      pending = { start: block.start, end: block.end, sectionName: block.sectionName }
    }
  }
  flushPending()

  return ranges.map((range, chunkIndex) => ({
    chunkIndex,
    sectionName: range.sectionName,
    content: markdown.slice(range.start, range.end),
    contentStartOffset: range.start,
    contentEndOffset: range.end,
  }))
}
