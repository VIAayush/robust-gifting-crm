import type { SupabaseClient } from '@supabase/supabase-js'
import { staffCanShareWithClient } from '@/lib/requirements/workflow'

export type ShareResult = { ok: true; alreadyShared: boolean } | { ok: false; error: string }

const NOTE_MAX = 1000

/** True when the company has at least one active client portal user who could answer. */
export async function companyHasClientUsers(admin: SupabaseClient, companyId: string): Promise<boolean> {
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('role', ['client_admin', 'client_user'])
    .eq('is_active', true)
  return (count || 0) > 0
}

/**
 * Shares a staff-created requirement with the company's client users: it enters the approval workflow at
 * "admin_approved" (the staff side has already approved it), which is exactly the stage in which the client
 * portal offers Confirm / Request changes. Runs with the service role because clients and staff cannot write
 * workflow fields through the API (requirements_workflow_guard); the CALLER must already have been authorised.
 *
 * Idempotent: the conditional update only succeeds while the requirement has no workflow stage, so a double
 * click or a retry never writes a second history row or notification.
 */
export async function shareRequirementWithClient(
  admin: SupabaseClient,
  input: { requirementId: string; actorId: string; note?: string | null },
): Promise<ShareResult> {
  const note = String(input.note ?? '').trim().slice(0, NOTE_MAX) || null
  const { data: requirement, error: readError } = await admin
    .from('requirements')
    .select('id, name, company_id, workflow_stage, status')
    .eq('id', input.requirementId)
    .maybeSingle()
  if (readError || !requirement) return { ok: false, error: 'Requirement not found.' }
  if (requirement.workflow_stage) return { ok: true, alreadyShared: true }
  if (!staffCanShareWithClient(requirement.workflow_stage as string | null, requirement.status as string | null)) {
    return { ok: false, error: 'A closed requirement cannot be shared with the client.' }
  }
  if (!requirement.company_id) return { ok: false, error: 'Assign the requirement to a company first.' }
  if (!(await companyHasClientUsers(admin, requirement.company_id as string))) {
    return { ok: false, error: 'This company has no active client users yet, so nobody can respond. Invite a client user first.' }
  }

  const { data: claimed, error: updateError } = await admin
    .from('requirements')
    .update({
      workflow_stage: 'admin_approved',
      admin_decided_at: new Date().toISOString(),
      admin_decided_by: input.actorId,
      decision_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requirement.id)
    .is('workflow_stage', null)
    .select('id')
    .maybeSingle()
  if (updateError) return { ok: false, error: 'We could not share the requirement. Please try again.' }
  if (!claimed) return { ok: true, alreadyShared: true }

  const { error: eventError } = await admin.from('requirement_events').insert({
    requirement_id: requirement.id,
    actor_id: input.actorId,
    actor_kind: 'staff',
    from_stage: null,
    to_stage: 'admin_approved',
    note,
    visible_to_client: true,
  })
  if (eventError) console.error('[crm] requirement share history failed', eventError.message)

  await admin.rpc('notify_users', {
    p_audience: 'client',
    p_company_id: requirement.company_id,
    p_title: `Your account manager shared a requirement: ${requirement.name}`,
    p_body: 'Please review it and confirm it, or ask for changes.',
    p_link: `/portal/requirements/${requirement.id}`,
  })
  return { ok: true, alreadyShared: false }
}
