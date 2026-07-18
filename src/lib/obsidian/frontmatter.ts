import { parseDocument } from 'yaml'

export type ParsedFrontmatter = {
  values: Record<string, unknown>
  title: string | null
  url: string | null
  channel: string | null
  publishedAt: string | null
}

const frontmatterPattern = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export function getMarkdownBodyStart(markdown: string) {
  return markdown.match(frontmatterPattern)?.[0].length ?? 0
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalDate(value: unknown) {
  if (value == null || value === '') return null
  const text = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`published 값은 YYYY-MM-DD 형식이어야 합니다: ${text}`)
  }

  const date = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`published 날짜가 올바르지 않습니다: ${text}`)
  }

  return text
}

export function parseMarkdownFrontmatter(markdown: string): ParsedFrontmatter {
  const match = markdown.match(frontmatterPattern)
  if (!match) {
    return {
      values: {},
      title: null,
      url: null,
      channel: null,
      publishedAt: null,
    }
  }

  const document = parseDocument(match[1], {
    prettyErrors: false,
    uniqueKeys: true,
  })

  if (document.errors.length > 0) {
    throw new Error(`YAML frontmatter 오류: ${document.errors[0].message}`)
  }

  const parsed: unknown = document.toJS({ maxAliasCount: 100 })
  if (parsed == null) {
    return {
      values: {},
      title: null,
      url: null,
      channel: null,
      publishedAt: null,
    }
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML frontmatter의 최상위 값은 객체여야 합니다.')
  }

  const values = parsed as Record<string, unknown>
  return {
    values,
    title: optionalString(values.title),
    url: optionalString(values.url),
    channel: optionalString(values.channel),
    publishedAt: optionalDate(values.published),
  }
}
