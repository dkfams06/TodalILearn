import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { createAdminClient } from '@/lib/supabase/admin'

import { exportSermonToObsidian } from './obsidian-export'
import { classifySyncState } from './sync-classify'
import type { SermonDraft, SermonSyncOutcome, SermonSyncResolveOutcome } from './types'
import { currentVersion, latestConflictBackup } from './version-utils'
import {
  ensureVersions,
  hashContent,
  insertVersion,
  listVersions,
  nextVersionNumber,
} from './version-store'

type AdminClient = ReturnType<typeof createAdminClient>

type SermonRow = {
  id: string
  title: string
  draft: SermonDraft
  created_at: string
  obsidian_relative_path: string | null
  obsidian_content_hash: string | null
}

async function loadSermon(admin: AdminClient, sermonId: string, userId: string): Promise<SermonRow> {
  const { data, error } = await admin
    .from('sermons')
    .select('id,title,draft,created_at,obsidian_relative_path,obsidian_content_hash')
    .eq('id', sermonId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('설교를 찾지 못했습니다.')
  return data as SermonRow
}

async function readFileIfExists(absolutePath: string): Promise<string | null> {
  try {
    return await readFile(/*turbopackIgnore: true*/ absolutePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function updateMarker(admin: AdminClient, sermonId: string, userId: string, contentHash: string) {
  const syncedAt = new Date().toISOString()
  const { error } = await admin
    .from('sermons')
    .update({ obsidian_content_hash: contentHash, obsidian_synced_at: syncedAt, updated_at: syncedAt })
    .eq('id', sermonId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return syncedAt
}

// 옵시디언 파일과 서버 대표 버전을 비교해 한쪽만 바뀌었으면 다른 쪽에 반영하고,
// 둘 다 바뀌었으면 파일 내용을 conflict_backup으로 즉시 보존한 뒤 사용자의 선택을 기다린다.
export async function checkSermonSync(
  admin: AdminClient,
  input: { sermonId: string; userId: string; outputFolder: string },
): Promise<SermonSyncOutcome> {
  const sermon = await loadSermon(admin, input.sermonId, input.userId)
  if (!sermon.obsidian_relative_path) {
    throw new Error('아직 옵시디언에 저장되지 않았습니다. 먼저 "옵시디언에 저장"을 눌러 주세요.')
  }
  const relativePath = sermon.obsidian_relative_path
  const createdAt = new Date(sermon.created_at)

  let versions = await ensureVersions(admin, {
    sermonId: sermon.id,
    userId: input.userId,
    draft: sermon.draft,
    createdAt,
  })
  const current = currentVersion(versions)
  if (!current) throw new Error('대표 버전을 찾지 못했습니다.')

  const absolutePath = path.join(input.outputFolder, relativePath)
  const fileContent = await readFileIfExists(absolutePath)
  if (fileContent === null) {
    return { status: 'local_file_missing', relativePath, syncedAt: null, versions }
  }

  const fileHash = hashContent(fileContent)
  const currentHash = hashContent(current.content)
  const classification = classifySyncState({
    markerHash: sermon.obsidian_content_hash,
    fileHash,
    currentHash,
  })

  if (classification === 'unchanged') {
    const markerStale = sermon.obsidian_content_hash !== fileHash
    const syncedAt = markerStale ? await updateMarker(admin, sermon.id, input.userId, fileHash) : null
    return { status: 'unchanged', relativePath, syncedAt, versions }
  }

  if (classification === 'push') {
    await exportSermonToObsidian({
      outputFolder: input.outputFolder,
      title: sermon.title,
      markdown: current.content,
      existingRelativePath: relativePath,
      createdAt,
    })
    const syncedAt = await updateMarker(admin, sermon.id, input.userId, currentHash)
    return { status: 'pushed_to_local', relativePath, syncedAt, versions }
  }

  if (classification === 'pull') {
    const versionNumber = await nextVersionNumber(admin, sermon.id)
    await insertVersion(admin, {
      sermonId: sermon.id,
      userId: input.userId,
      versionNumber,
      source: 'obsidian',
      content: fileContent,
      editReasons: [],
      note: '옵시디언 파일에서 가져옴',
    })
    const syncedAt = await updateMarker(admin, sermon.id, input.userId, fileHash)
    versions = await listVersions(admin, sermon.id)
    return { status: 'pulled_from_local', relativePath, syncedAt, versions }
  }

  // conflict: 파일 내용을 즉시 백업한다. 마커는 그대로 두어 사용자가 고르기 전까지
  // 다음 확인에서도 같은 충돌로 다시 보고되게 한다.
  const versionNumber = await nextVersionNumber(admin, sermon.id)
  const backupVersion = await insertVersion(admin, {
    sermonId: sermon.id,
    userId: input.userId,
    versionNumber,
    source: 'conflict_backup',
    content: fileContent,
    editReasons: [],
    note: '충돌: 옵시디언 파일과 서버가 각각 수정되어 자동 백업됨',
  })
  versions = await listVersions(admin, sermon.id)
  return {
    status: 'conflict',
    relativePath,
    syncedAt: null,
    versions,
    conflict: { currentVersion: current, backupVersion },
  }
}

// 충돌 해결 — "로컬 파일 내용 채택"만 여기서 처리한다(순수 DB, 파일 접근 없음).
// "서버 버전 유지"는 새 코드 없이 기존 옵시디언 저장(export) 경로를 그대로 재사용한다:
// 대표 버전 계산이 conflict_backup을 건너뛰므로 export가 자동으로 서버 대표 버전을 파일에
// 다시 쓴다(이미 conflict_backup으로 보존된 로컬 편집은 유실되지 않는다).
export async function adoptLocalConflict(
  admin: AdminClient,
  input: { sermonId: string; userId: string },
): Promise<SermonSyncResolveOutcome> {
  const versions = await listVersions(admin, input.sermonId)
  const backup = latestConflictBackup(versions)
  if (!backup) throw new Error('채택할 충돌 백업을 찾지 못했습니다.')

  const versionNumber = await nextVersionNumber(admin, input.sermonId)
  await insertVersion(admin, {
    sermonId: input.sermonId,
    userId: input.userId,
    versionNumber,
    source: 'obsidian',
    content: backup.content,
    editReasons: [],
    note: '충돌 해결: 옵시디언 파일 내용 채택',
  })
  await updateMarker(admin, input.sermonId, input.userId, hashContent(backup.content))

  return { versions: await listVersions(admin, input.sermonId) }
}
