'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth'
import { getAllowedModules } from '@/lib/module-access'
import { writeAudit } from '@/lib/audit'
import { notifyRequirementEvent } from '@/lib/notifications'
import { companyHasClientUsers, shareRequirementWithClient } from '@/lib/requirements/share'
import { MIGRATION_MESSAGE, isMissingTable, type ResponseItem } from '@/lib/catalogues/responses'

export type ResponseActionResult = { success: true; message: string; requirementId?: string } | { error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same gate as the catalogue editor: Catalogues module plus a role that can edit sales data. */
async function gate(): Promise<{ ok: false; error: string } | { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getProfile>>> }> {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { ok: false, error: 'Your session has expired. Please sign in again.' }
  const { modules } = await getAllowedModules()
  if (!modules.has('catalogues')) return { ok: false, error: 'You do not have access to Catalogues.' }
  if (profile.role !== 'admin' && profile.role !== 'sales') return { ok: false, error: 'Your role can view client responses but not act on them.' }
  return { ok: true, profile }
}

function refresh(campaignId?: string) {
  revalidatePath('/crm/products/catalogues')
  revalidatePath('/crm/products/catalogues/responses')
  if (campaignId) {
    revalidatePath(`/crm/products/catalogues/${campaignId}`)
    revalidatePath(`/portal/catalogues/${campaignId}`)
  }
  revalidatePath('/crm/requirements')
  revalidatePath('/portal/requirements')
}

async function loadResponse(responseId: string) {
  // Row-level security limits this read to staff who may see catalogue responses.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('catalogue_responses')
    .select('id, campaign_id, company_id, status, comment, items, revision, requirement_id, campaign:campaigns!campaign_id(name, occasion)')
    .eq('id', responseId)
    .maybeSingle()
  return { data, error }
}

async function tellClient(admin: NonNullable<ReturnType<typeof createAdminClient>>, row: { company_id: string; campaign_id: string }, title: string, body: string) {
  const { error } = await admin.rpc('notify_users', {
    p_audience: 'client',
    p_company_id: row.company_id,
    p_title: title,
    p_body: body,
    p_link: `/portal/catalogues/${row.campaign_id}`,
  })
  if (error) console.error('[crm] catalogue response client notification failed', error.message)
}

/**
 * Turns a client's catalogue response into ONE requirement for that company, carrying the products and quantities the
 * client chose (at the catalogue prices they saw). Optionally shares it with the client for confirmation through the
 * normal requirement approval flow. Repeating it never creates a second requirement: the submission key is unique per
 * company and the response keeps the link.
 */
export async function createRequirementFromCatalogueResponse(responseId: string, shareWithClient: boolean): Promise<ResponseActionResult> {
  if (!UUID.test(String(responseId))) return { error: 'Response not found.' }
  const g = await gate()
  if (!g.ok) return { error: g.error }

  const { data: response, error } = await loadResponse(responseId)
  if (error) return { error: isMissingTable(error) ? MIGRATION_MESSAGE : 'Could not load the response.' }
  if (!response) return { error: 'Response not found.' }
  if (response.requirement_id) {
    return { success: true, message: 'A requirement was already created from this response.', requirementId: response.requirement_id as string }
  }
  const items = ((response.items as ResponseItem[]) || []).filter((i) => i && i.product_id && Number(i.quantity) >= 1)
  if (items.length === 0) return { error: 'This response has no products. Mark it as processed instead.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'This cannot be done right now. Please try again shortly.' }
  const campaign = Array.isArray(response.campaign) ? response.campaign[0] : response.campaign
  const catalogueName = (campaign as { name?: string } | null)?.name || 'catalogue'

  const { data: company } = await admin.from('companies').select('owner_id').eq('id', response.company_id).maybeSingle()
  const submissionKey = `catresp-${response.id}`
  let requirementId: string | null = null
  const existing = await admin.from('requirements').select('id').eq('company_id', response.company_id).eq('submission_key', submissionKey).maybeSingle()
  if (existing.data) requirementId = existing.data.id as string

  if (!requirementId) {
    const totalUnits = items.reduce((sum, i) => sum + Number(i.quantity), 0)
    const comment = String(response.comment || '').trim()
    const { data: created, error: insertError } = await admin
      .from('requirements')
      .insert({
        name: `${catalogueName} – selection`.slice(0, 120),
        company_id: response.company_id,
        owner_id: company?.owner_id ?? g.profile.id,
        quantity: Math.min(totalUnits, 1_000_000),
        purpose: (campaign as { occasion?: string } | null)?.occasion || null,
        description: [`Created from the client's response to the catalogue "${catalogueName}".`, comment ? `Client comments: ${comment}` : ''].filter(Boolean).join('\n'),
        status: 'active',
        submission_key: submissionKey,
      })
      .select('id')
      .single()
    if (insertError?.code === '23505') {
      const winner = await admin.from('requirements').select('id').eq('company_id', response.company_id).eq('submission_key', submissionKey).maybeSingle()
      requirementId = (winner.data?.id as string) || null
    } else if (insertError || !created) {
      console.error('[crm] requirement from catalogue response failed', insertError?.message)
      return { error: 'Could not create the requirement. Please try again.' }
    } else {
      requirementId = created.id as string
      const { error: itemsError } = await admin.from('requirement_products').insert(
        items.map((i) => ({
          requirement_id: requirementId,
          product_id: i.product_id,
          quantity: Number(i.quantity),
          unit_price_snapshot: Number(i.unit_price),
          notes: [`Catalogue: ${catalogueName} at ₹${Number(i.unit_price).toLocaleString('en-IN')}`, i.notes || ''].filter(Boolean).join(' · '),
        })),
      )
      if (itemsError) {
        // Do not leave a requirement without the products the client chose.
        await admin.from('requirements').delete().eq('id', requirementId)
        console.error('[crm] requirement products from catalogue response failed', itemsError.message)
        return { error: 'Could not attach the products to the requirement. Nothing was created.' }
      }
    }
  }
  if (!requirementId) return { error: 'Could not create the requirement. Please try again.' }

  const { data: linked, error: linkError } = await admin
    .from('catalogue_responses')
    .update({ status: 'processed', processed_at: new Date().toISOString(), processed_by: g.profile.id, requirement_id: requirementId })
    .eq('id', response.id)
    .is('requirement_id', null)
    .select('id')
    .maybeSingle()
  if (linkError) console.error('[crm] catalogue response link failed', linkError.message)

  let message = 'Requirement created from the client’s selection.'
  if (shareWithClient && (await companyHasClientUsers(admin, response.company_id as string))) {
    const shared = await shareRequirementWithClient(admin, {
      requirementId,
      actorId: g.profile.id,
      note: `Prepared from your selection in "${catalogueName}". Please confirm it.`,
    })
    if (shared.ok && !shared.alreadyShared) {
      await notifyRequirementEvent(requirementId, 'admin_approved', `Prepared from your selection in "${catalogueName}".`)
      message = 'Requirement created and sent to the client for confirmation.'
    }
  } else if (!linked) {
    message = 'A requirement already exists for this response.'
  }
  await tellClient(
    admin,
    { company_id: response.company_id as string, campaign_id: response.campaign_id as string },
    `Your catalogue response was picked up: ${catalogueName}`,
    'Your account manager is preparing the next step.',
  )
  await writeAudit(admin, { action: 'create', entity: 'requirement', entityId: requirementId, next: { from_catalogue_response: response.id }, userId: g.profile.id })
  refresh(response.campaign_id as string)
  return { success: true, message, requirementId }
}

/** Follow-up done without creating a requirement (for example a comments-only response answered by phone). */
export async function markCatalogueResponseProcessed(responseId: string): Promise<ResponseActionResult> {
  if (!UUID.test(String(responseId))) return { error: 'Response not found.' }
  const g = await gate()
  if (!g.ok) return { error: g.error }
  const { data: response, error } = await loadResponse(responseId)
  if (error) return { error: isMissingTable(error) ? MIGRATION_MESSAGE : 'Could not load the response.' }
  if (!response) return { error: 'Response not found.' }
  if (response.status === 'processed') return { success: true, message: 'Already marked as processed.' }
  const admin = createAdminClient()
  if (!admin) return { error: 'This cannot be done right now. Please try again shortly.' }
  const { data: updated, error: updateError } = await admin
    .from('catalogue_responses')
    .update({ status: 'processed', processed_at: new Date().toISOString(), processed_by: g.profile.id })
    .eq('id', response.id)
    .eq('status', 'submitted')
    .select('id')
    .maybeSingle()
  if (updateError) return { error: 'Could not update the response.' }
  if (updated) {
    const campaign = Array.isArray(response.campaign) ? response.campaign[0] : response.campaign
    await tellClient(
      admin,
      { company_id: response.company_id as string, campaign_id: response.campaign_id as string },
      `Your catalogue response was reviewed: ${(campaign as { name?: string } | null)?.name || 'catalogue'}`,
      'Your account manager will be in touch.',
    )
    await writeAudit(admin, { action: 'update', entity: 'catalogue_response', entityId: response.id as string, next: { status: 'processed' }, userId: g.profile.id })
  }
  refresh(response.campaign_id as string)
  return { success: true, message: 'Marked as processed.' }
}
