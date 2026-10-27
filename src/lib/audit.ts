import type { SupabaseClient } from '@supabase/supabase-js'
import { redactAuditValue } from '@/lib/audit-redact'

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
    // Cost and margin figures never go into the audit log (see audit-redact.ts).
    previous_value: redactAuditValue(params.entity, params.previous) ?? null,
    new_value: redactAuditValue(params.entity, params.next) ?? null,
  })
  if (error) {
    console.error('audit_logs insert failed', error.message)
  }
}
