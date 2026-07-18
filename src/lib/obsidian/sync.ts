import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { LocalSettings } from '@/lib/local-settings'
import { discoverMarkdownFiles, readMarkdownFile } from './files'
import { parseMarkdownFrontmatter } from './frontmatter'

type ExistingSource = {
  id: string
  relative_path: string
  content_hash: string
  source_deleted: boolean
  sync_status: string
}

export type SyncError = {
  relativePath: string
  message: string
}

export type SyncResult = {
  scanned: number
  created: number
  updated: number
  restored: number
  unchanged: number
  deleted: number
  failed: number
  errors: SyncError[]
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
}

function fallbackTitle(fileName: string) {
  return path.basename(fileName, path.extname(fileName))
}

export async function syncObsidianSources({
  userId,
  settings,
  supabase,
}: {
  userId: string
  settings: LocalSettings
  supabase: SupabaseClient
}): Promise<SyncResult> {
  const files = await discoverMarkdownFiles(settings.inputFolder)
  const now = new Date().toISOString()
  const result: SyncResult = {
    scanned: files.length,
    created: 0,
    updated: 0,
    restored: 0,
    unchanged: 0,
    deleted: 0,
    failed: 0,
    errors: [],
  }

  const { error: deviceError } = await supabase.from('obsidian_devices').upsert({
    user_id: userId,
    device_name: settings.deviceName,
    vault_id: settings.vaultId,
    local_input_folder: settings.inputFolder,
    local_output_folder: settings.outputFolder,
    last_connected_at: now,
  }, { onConflict: 'user_id,device_name,vault_id' })

  if (deviceError) throw new Error(`기기 상태 저장 실패: ${deviceError.message}`)

  const { data: existingData, error: existingError } = await supabase
    .from('obsidian_sources')
    .select('id,relative_path,content_hash,source_deleted,sync_status')
    .eq('user_id', userId)
    .eq('vault_id', settings.vaultId)

  if (existingError) throw new Error(`기존 문서 조회 실패: ${existingError.message}`)

  const existingSources = new Map(
    ((existingData ?? []) as ExistingSource[]).map((source) => [source.relative_path, source]),
  )
  const discoveredPaths = new Set(files.map((file) => file.relativePath))

  for (const file of files) {
    const existing = existingSources.get(file.relativePath)
    let contents: Awaited<ReturnType<typeof readMarkdownFile>> | null = null

    try {
      contents = await readMarkdownFile(file)

      if (
        existing &&
        existing.content_hash === contents.contentHash &&
        !existing.source_deleted &&
        existing.sync_status !== 'failed'
      ) {
        result.unchanged += 1
        continue
      }

      const metadata = parseMarkdownFrontmatter(contents.rawMarkdown)
      const syncStatus = existing ? 'needs_reprocessing' : 'completed'
      const payload = {
        user_id: userId,
        vault_id: settings.vaultId,
        relative_path: file.relativePath,
        file_name: file.fileName,
        folder_path: file.folderPath,
        title: metadata.title ?? fallbackTitle(file.fileName),
        url: metadata.url,
        channel: metadata.channel,
        published_at: metadata.publishedAt,
        frontmatter: metadata.values,
        raw_markdown: contents.rawMarkdown,
        content_hash: contents.contentHash,
        file_modified_at: contents.fileModifiedAt,
        sync_status: syncStatus,
        sync_error: null,
        source_deleted: false,
        last_synced_at: now,
      }

      const { error } = existing
        ? await supabase.from('obsidian_sources').update(payload).eq('id', existing.id)
        : await supabase.from('obsidian_sources').insert(payload)

      if (error) throw new Error(error.message)

      if (!existing) result.created += 1
      else if (existing.source_deleted) result.restored += 1
      else result.updated += 1
    } catch (error) {
      const message = errorMessage(error)
      result.failed += 1
      result.errors.push({ relativePath: file.relativePath, message })

      const failurePayload = {
        sync_status: 'failed',
        sync_error: message,
        last_synced_at: now,
      }

      if (existing) {
        await supabase.from('obsidian_sources').update(failurePayload).eq('id', existing.id)
      } else if (contents) {
        await supabase.from('obsidian_sources').insert({
          user_id: userId,
          vault_id: settings.vaultId,
          relative_path: file.relativePath,
          file_name: file.fileName,
          folder_path: file.folderPath,
          title: fallbackTitle(file.fileName),
          frontmatter: {},
          raw_markdown: contents.rawMarkdown,
          content_hash: contents.contentHash,
          file_modified_at: contents.fileModifiedAt,
          source_deleted: false,
          ...failurePayload,
        })
      }
    }
  }

  for (const source of existingSources.values()) {
    if (discoveredPaths.has(source.relative_path) || source.source_deleted) continue

    const { error } = await supabase
      .from('obsidian_sources')
      .update({
        source_deleted: true,
        sync_status: 'source_deleted',
        sync_error: null,
        last_synced_at: now,
      })
      .eq('id', source.id)

    if (error) {
      result.failed += 1
      result.errors.push({ relativePath: source.relative_path, message: error.message })
    } else {
      result.deleted += 1
    }
  }

  return result
}
