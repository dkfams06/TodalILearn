import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

import { exportSermonToObsidian } from './obsidian-export'
import type { SermonDraft } from './types'
import { ensureVersions, hashContent } from './version-store'

type AdminClient = ReturnType<typeof createAdminClient>

export type SermonExportOutcome = {
  relativePath: string
  syncedAt: string
}

type SermonRow = {
  id: string
  title: string
  draft: SermonDraft
  created_at: string
  obsidian_relative_path: string | null
}

// 저장된 설교의 최신 버전 Markdown을 옵시디언 출력 폴더에 쓰고, 그 위치를 sermons에 기록한다.
// 로컬 API 라우트와 Companion 작업이 공유한다.
export async function exportSermon(
  admin: AdminClient,
  input: { sermonId: string; userId: string; outputFolder: string },
): Promise<SermonExportOutcome> {
  const { data, error } = await admin
    .from('sermons')
    .select('id,title,draft,created_at,obsidian_relative_path')
    .eq('id', input.sermonId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('설교를 찾지 못했습니다.')

  const sermon = data as SermonRow
  const createdAt = new Date(sermon.created_at)
  // 최신 버전을 완성본으로 저장한다. 버전이 없는 레거시 설교는 draft로 버전 1을 지연 생성한다.
  const versions = await ensureVersions(admin, {
    sermonId: sermon.id,
    userId: input.userId,
    draft: sermon.draft,
    createdAt,
  })
  const markdown = versions[versions.length - 1]?.content ?? ''
  if (!markdown.trim()) throw new Error('저장할 설교 본문이 없습니다.')

  const result = await exportSermonToObsidian({
    outputFolder: input.outputFolder,
    title: sermon.title,
    markdown,
    existingRelativePath: sermon.obsidian_relative_path,
    createdAt,
  })

  const syncedAt = new Date().toISOString()
  const { error: updateError } = await admin
    .from('sermons')
    .update({
      obsidian_relative_path: result.relativePath,
      obsidian_synced_at: syncedAt,
      obsidian_content_hash: hashContent(markdown),
      updated_at: syncedAt,
    })
    .eq('id', sermon.id)
    .eq('user_id', input.userId)
  if (updateError) throw new Error(updateError.message)

  return { relativePath: result.relativePath, syncedAt }
}
