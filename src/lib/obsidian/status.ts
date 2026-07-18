import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type ObsidianSyncSummary = {
  active: number
  deleted: number
  failed: number
  lastSyncedAt: string | null
}

export async function getObsidianSyncSummary(userId: string, vaultId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('obsidian_sources')
    .select('source_deleted,sync_status,last_synced_at')
    .eq('user_id', userId)
    .eq('vault_id', vaultId)

  if (error) throw new Error(`동기화 상태 조회 실패: ${error.message}`)

  const rows = data ?? []
  return rows.reduce<ObsidianSyncSummary>((summary, row) => {
    if (row.source_deleted) summary.deleted += 1
    else summary.active += 1
    if (row.sync_status === 'failed') summary.failed += 1
    if (row.last_synced_at && (!summary.lastSyncedAt || row.last_synced_at > summary.lastSyncedAt)) {
      summary.lastSyncedAt = row.last_synced_at
    }
    return summary
  }, { active: 0, deleted: 0, failed: 0, lastSyncedAt: null })
}
