import type { SupabaseClient } from '@supabase/supabase-js'

export async function writeAudit(
  supabase: SupabaseClient,
  params: {
    action: string
    entity: string
    entityId?: string | null
    previous?: unknown
    next?: unknown
    userId?: string | null
  }
) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: params.userId || null,
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId || null,
    previous_value: params.previous ?? null,
    new_value: params.next ?? null,
  })
  if (error) {
    console.error('audit_logs insert failed', error.message)
  }
}
