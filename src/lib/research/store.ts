import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

import { validateResearchBundle } from './persist'
import type { SavedResearchBundle, SavedResearchSummary } from './types'

type AdminClient = ReturnType<typeof createAdminClient>

export async function saveResearchBundle(
  admin: AdminClient,
  userId: string,
  value: unknown,
): Promise<SavedResearchBundle> {
  const bundle = validateResearchBundle(value)
  const { data, error } = await admin
    .from('research_bundles')
    .insert({
      user_id: userId,
      query: bundle.query.trim(),
      personal_context: bundle.personalContext,
      input_type: bundle.inputType,
      core_message: bundle.coreMessage,
      bundle,
      provider: bundle.provider,
      model: bundle.model,
      prompt_version: bundle.promptVersion,
    })
    .select('id,created_at')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id, createdAt: data.created_at, bundle }
}

export async function listSavedResearch(
  admin: AdminClient,
  userId: string,
): Promise<SavedResearchSummary[]> {
  const { data, error } = await admin
    .from('research_bundles')
    .select('id,query,core_message,input_type,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    query: row.query,
    coreMessage: row.core_message,
    inputType: row.input_type,
    createdAt: row.created_at,
  })) as SavedResearchSummary[]
}

export async function getSavedResearch(
  admin: AdminClient,
  userId: string,
  id: string,
): Promise<SavedResearchBundle | null> {
  const { data, error } = await admin
    .from('research_bundles')
    .select('id,bundle,created_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    createdAt: data.created_at,
    bundle: validateResearchBundle(data.bundle),
  }
}
