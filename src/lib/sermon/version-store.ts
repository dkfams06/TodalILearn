import 'server-only'

import { createHash } from 'node:crypto'

import type { createAdminClient } from '@/lib/supabase/admin'

import { formatSermonMarkdown } from './markdown'
import type {
  EditReasonTag,
  SermonDraft,
  SermonVersion,
  SermonVersionSource,
} from './types'

type AdminClient = ReturnType<typeof createAdminClient>

type VersionRow = {
  id: string
  version_number: number
  source: string
  content: string
  edit_reasons: unknown
  note: string | null
  created_at: string
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function toVersion(row: VersionRow): SermonVersion {
  return {
    id: row.id,
    versionNumber: row.version_number,
    source: row.source as SermonVersionSource,
    content: row.content,
    editReasons: Array.isArray(row.edit_reasons) ? (row.edit_reasons as EditReasonTag[]) : [],
    note: row.note,
    createdAt: row.created_at,
  }
}

const VERSION_COLUMNS = 'id,version_number,source,content,edit_reasons,note,created_at'

export async function listVersions(admin: AdminClient, sermonId: string): Promise<SermonVersion[]> {
  const { data, error } = await admin
    .from('sermon_versions')
    .select(VERSION_COLUMNS)
    .eq('sermon_id', sermonId)
    .order('version_number', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as VersionRow[] | null ?? []).map(toVersion)
}

export async function insertVersion(
  admin: AdminClient,
  input: {
    sermonId: string
    userId: string
    versionNumber: number
    source: SermonVersionSource
    content: string
    editReasons: EditReasonTag[]
    note: string | null
  },
): Promise<SermonVersion> {
  const { data, error } = await admin
    .from('sermon_versions')
    .insert({
      sermon_id: input.sermonId,
      user_id: input.userId,
      version_number: input.versionNumber,
      source: input.source,
      content: input.content,
      content_hash: hashContent(input.content),
      edit_reasons: input.editReasons,
      note: input.note,
    })
    .select(VERSION_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toVersion(data as VersionRow)
}

// 저장된 설교의 다음 버전 번호(현재 최대 + 1). 단일 사용자 환경이라 라우트에서 계산한다.
export async function nextVersionNumber(admin: AdminClient, sermonId: string): Promise<number> {
  const { data, error } = await admin
    .from('sermon_versions')
    .select('version_number')
    .eq('sermon_id', sermonId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.version_number ?? 0) + 1
}

// draft로 버전 1(AI 생성본)을 만든다. 새 설교 저장과 레거시 지연 백필이 함께 쓴다.
export async function createInitialVersion(
  admin: AdminClient,
  input: { sermonId: string; userId: string; draft: SermonDraft; createdAt?: Date },
): Promise<SermonVersion> {
  return insertVersion(admin, {
    sermonId: input.sermonId,
    userId: input.userId,
    versionNumber: 1,
    source: 'ai_generation',
    content: formatSermonMarkdown(input.draft, input.createdAt),
    editReasons: [],
    note: null,
  })
}

// 버전이 하나도 없는(마이그레이션 009 이전에 저장된) 설교에 버전 1을 지연 생성한다.
export async function ensureVersions(
  admin: AdminClient,
  input: { sermonId: string; userId: string; draft: SermonDraft; createdAt?: Date },
): Promise<SermonVersion[]> {
  const existing = await listVersions(admin, input.sermonId)
  if (existing.length > 0) return existing
  const first = await createInitialVersion(admin, input)
  return [first]
}
