import type { SupabaseClient } from '@supabase/supabase-js'
import { originFromCreationEvent, type RequirementOrigin } from '@/lib/requirements/workflow'

/**
 * The staff Requirements list query. requirements has several foreign keys to
 * profiles (owner, admin decision, client confirmation, selection decision), so
 * the owner embed MUST name its foreign key: an unqualified `profiles(...)` is
 * ambiguous (PostgREST PGRST201) and the whole list silently came back empty.
 */
export const REQUIREMENT_LIST_SELECT =
  '*, company:companies(id, name), owner:profiles!requirements_owner_id_fkey(id, full_name)'

export type RequirementListFilter = 'all' | 'needs_review' | 'waiting_client' | 'ready_to_quote'

export const STAGE_GROUPS: Record<Exclude<RequirementListFilter, 'all'>, string[]> = {
  needs_review: ['submitted', 'selection_submitted'],
  waiting_client: ['changes_requested', 'admin_approved', 'client_confirmed', 'selection_changes_requested', 'quotation_sent'],
  ready_to_quote: ['selection_approved', 'quotation_rejected'],
}

export function isStageGroup(value: string): value is Exclude<RequirementListFilter, 'all'> {
  return Object.prototype.hasOwnProperty.call(STAGE_GROUPS, value)
}

/** Who started each requirement, from the first history row. Requirements without history default to 'client'. */
export async function loadRequirementOrigins(supabase: SupabaseClient, ids: string[]): Promise<Map<string, RequirementOrigin>> {
  const origins = new Map<string, RequirementOrigin>()
  if (ids.length === 0) return origins
  const { data } = await supabase.from('requirement_events').select('requirement_id, actor_kind').is('from_stage', null).in('requirement_id', ids)
  for (const row of data || []) origins.set(row.requirement_id as string, originFromCreationEvent(row.actor_kind as string))
  return origins
}

/** Number of products attached to each requirement. */
export async function loadProductCounts(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts
  const { data } = await supabase.from('requirement_products').select('requirement_id').in('requirement_id', ids)
  for (const row of data || []) counts.set(row.requirement_id as string, (counts.get(row.requirement_id as string) || 0) + 1)
  return counts
}
