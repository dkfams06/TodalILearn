import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

import type {
  EvaluationScores,
  EvaluationVerdict,
  SermonEvaluation,
} from './types'

type AdminClient = ReturnType<typeof createAdminClient>

type EvaluationRow = {
  id: string
  version_number: number | null
  scores: unknown
  verdict: string
  note: string | null
  created_at: string
}

const EVALUATION_COLUMNS = 'id,version_number,scores,verdict,note,created_at'

export function toEvaluation(row: EvaluationRow): SermonEvaluation {
  return {
    id: row.id,
    versionNumber: row.version_number,
    scores: row.scores as EvaluationScores,
    verdict: row.verdict as EvaluationVerdict,
    note: row.note,
    createdAt: row.created_at,
  }
}

export async function listEvaluations(admin: AdminClient, sermonId: string): Promise<SermonEvaluation[]> {
  const { data, error } = await admin
    .from('sermon_evaluations')
    .select(EVALUATION_COLUMNS)
    .eq('sermon_id', sermonId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as EvaluationRow[] | null ?? []).map(toEvaluation)
}

export { EVALUATION_COLUMNS }
