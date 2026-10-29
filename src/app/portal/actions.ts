'use server'

import { exactIlike } from '@/lib/security/like'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notifyRequirementEvent } from '@/lib/notifications'
import { quotationExpired, EXPIRED_MESSAGE } from '@/lib/quotations/validity'
import { overallOutcome, validateDecisions, type ItemDecision } from '@/lib/quotations/decisions'
import { OTHER_PURPOSE, PURPOSE_OPTIONS, MAX_CUSTOM_PURPOSE_LENGTH } from '@/lib/requirements/purpose'

export type PortalRequirementInput = {
  name: string
  purpose: string
  custom_purpose: string
  description: string
  budget_per_unit: string
  quantity: string
  deadline: string
  delivery_city: string
  /** Stable per wizard session so a retry or double-click cannot create a second requirement. */
  submission_key?: string
  items: { product_id: string; variant_id: string | null; quantity: number | string; notes?: string }[]
}

export type PortalRequirementResult =
  | { success: true; id: string }
  | { error: string; fieldErrors?: Partial<Record<keyof PortalRequirementInput | 'items', string>> }

const MAX_ITEMS = 200
const MAX_QTY = 1_000_000
const MAX_BUDGET = 10_000_000

function todayInIndia() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Client portal "Create requirement". Clients have no INSERT rights on
 * requirements / requirement_products under RLS (those are staff tables), so
 * the write runs with the service role, but only after everything that
 * matters is resolved server-side: the caller must be an active client user,
 * the company comes from client_company_id(), ownership goes to the company's
 * account manager, and every product must be visible to that company.
 */
export async function createPortalRequirement(input: PortalRequirementInput): Promise<PortalRequirementResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, full_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !profile.is_active || (profile.role !== 'client_admin' && profile.role !== 'client_user')) {
    return { error: 'Only client portal users can submit requirements here.' }
  }

  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Your account is not linked to a company yet. Please contact your account manager.' }

  const fieldErrors: NonNullable<Extract<PortalRequirementResult, { error: string }>['fieldErrors']> = {}

  const name = String(input.name || '').trim()
  if (!name) fieldErrors.name = 'Give this requirement a name.'
  else if (name.length > 120) fieldErrors.name = 'Keep the name under 120 characters.'

  const knownPurposes = new Set<string>(PURPOSE_OPTIONS.map((o) => o.value))
  let purpose: string | null = null
  const purposeCode = String(input.purpose || '')
  if (purposeCode === OTHER_PURPOSE) {
    const custom = String(input.custom_purpose || '').trim()
    if (!custom) fieldErrors.custom_purpose = 'Type the purpose / occasion.'
    else if (custom.length > MAX_CUSTOM_PURPOSE_LENGTH) {
      fieldErrors.custom_purpose = `Keep it under ${MAX_CUSTOM_PURPOSE_LENGTH} characters.`
    } else purpose = custom
  } else if (knownPurposes.has(purposeCode)) {
    purpose = purposeCode
  } else {
    fieldErrors.purpose = 'Select a purpose / occasion.'
  }

  const description = String(input.description || '').trim()
  if (description.length > 2000) fieldErrors.description = 'Keep the description under 2,000 characters.'

  const budgetRaw = String(input.budget_per_unit ?? '').trim()
  let budget: number | null = null
  if (budgetRaw) {
    const value = Number(budgetRaw)
    if (!Number.isFinite(value) || value <= 0) fieldErrors.budget_per_unit = 'Budget must be more than ₹0.'
    else if (value > MAX_BUDGET) fieldErrors.budget_per_unit = 'Budget looks too large. Please check it.'
    else budget = Math.round(value * 100) / 100
  }

  const qtyRaw = String(input.quantity ?? '').trim()
  let quantity: number | null = null
  if (qtyRaw) {
    const value = Number(qtyRaw)
    if (!Number.isInteger(value) || value < 1) fieldErrors.quantity = 'Quantity must be a whole number of at least 1.'
    else if (value > MAX_QTY) fieldErrors.quantity = 'Quantity looks too large. Please check it.'
    else quantity = value
  }

  const deadline = String(input.deadline || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline))) {
    fieldErrors.deadline = 'Choose a required-by date.'
  } else if (deadline < todayInIndia()) {
    fieldErrors.deadline = 'The required-by date cannot be in the past.'
  }

  const deliveryCity = String(input.delivery_city || '').trim()
  if (deliveryCity.length < 2) fieldErrors.delivery_city = 'Enter the delivery city.'
  else if (deliveryCity.length > 80) fieldErrors.delivery_city = 'Keep the city under 80 characters.'

  const rawItems = Array.isArray(input.items) ? input.items.slice(0, MAX_ITEMS + 1) : []
  if (rawItems.length > MAX_ITEMS) fieldErrors.items = `A requirement can include up to ${MAX_ITEMS} products.`
  const items = rawItems.slice(0, MAX_ITEMS).map((item) => ({
    product_id: String(item?.product_id || ''),
    variant_id: item?.variant_id ? String(item.variant_id) : null,
    quantity: Number(item?.quantity),
    notes: String(item?.notes ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
  }))
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > MAX_QTY)) {
    fieldErrors.items = 'Each product quantity must be a whole number of at least 1.'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: 'Please fix the highlighted fields.', fieldErrors }
  }

  // Products must be visible to this company (client_products is company-scoped).
  const productIds = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean)))
  const visible = new Map<string, { id: string }>()
  if (productIds.length) {
    const { data } = await supabase.from('client_products').select('id').in('id', productIds)
    for (const row of data || []) visible.set(row.id as string, row as { id: string })
  }
  if (productIds.some((id) => !visible.has(id))) {
    return {
      error: 'Some products are no longer available in your catalogue. Remove them from your shortlist and try again.',
      fieldErrors: { items: 'Some products are no longer available.' },
    }
  }

  const variantIds = Array.from(new Set(items.map((i) => i.variant_id).filter(Boolean))) as string[]
  const colourByVariant = new Map<string, string>()
  if (variantIds.length) {
    const { data } = await supabase.from('client_product_variants').select('id, colour, display_name').in('id', variantIds)
    for (const row of data || []) colourByVariant.set(row.id as string, (row.display_name || row.colour || '') as string)
  }

  // Items shortlisted from a catalogue carry its name and price, so staff quote against it.
  const catalogueNote = new Map<string, string>()
  if (productIds.length) {
    const { data: sources, error: sourceError } = await supabase
      .from('company_product_interests')
      .select('product_id, source_campaign_product_id')
      .eq('company_id', companyId)
      .in('product_id', productIds)
      .not('source_campaign_product_id', 'is', null)
    const offeringIds = Array.from(new Set((sources || []).map((s) => s.source_campaign_product_id as string)))
    if (!sourceError && offeringIds.length) {
      const { data: offerings } = await supabase
        .from('campaign_products')
        .select('id, selling_price, campaign:campaigns(name)')
        .in('id', offeringIds)
      const byOffering = new Map((offerings || []).map((o) => [o.id as string, o]))
      for (const source of sources || []) {
        const offering = byOffering.get(source.source_campaign_product_id as string)
        if (!offering) continue
        const campaign = Array.isArray(offering.campaign) ? offering.campaign[0] : offering.campaign
        catalogueNote.set(source.product_id as string, `Catalogue: ${campaign?.name || 'catalogue'} at ₹${Number(offering.selling_price).toLocaleString('en-IN')}`)
      }
    }
  }

  const admin = createAdminClient()
  if (!admin) return { error: 'Requirements cannot be submitted right now. Please contact your account manager.' }

  // Ownership goes to the account manager; a client never owns a requirement.
  const [{ data: company }, { data: contact }] = await Promise.all([
    admin.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    user.email
      ? admin.from('contacts').select('id').eq('company_id', companyId).ilike('email', exactIlike(user.email)).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const submissionKey = /^[A-Za-z0-9_-]{8,64}$/.test(String(input.submission_key || '')) ? String(input.submission_key) : null
  if (submissionKey) {
    const { data: existing } = await admin
      .from('requirements')
      .select('id')
      .eq('company_id', companyId)
      .eq('submission_key', submissionKey)
      .maybeSingle()
    if (existing) return { success: true, id: existing.id as string }
  }

  const { data: requirement, error } = await admin
    .from('requirements')
    .insert({
      name,
      company_id: companyId,
      contact_id: contact?.id ?? null,
      owner_id: company?.owner_id ?? null,
      purpose,
      description: description || null,
      budget,
      quantity,
      deadline,
      delivery_city: deliveryCity,
      status: 'active',
      workflow_stage: 'submitted',
      submission_key: submissionKey,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error?.code === '23505' && submissionKey) {
    // Lost a race with an identical submission: return the one that won.
    const { data: winner } = await admin
      .from('requirements')
      .select('id')
      .eq('company_id', companyId)
      .eq('submission_key', submissionKey)
      .maybeSingle()
    if (winner) return { success: true, id: winner.id as string }
  }

  if (error || !requirement) {
    console.error('[portal] create requirement failed', error?.message)
    return { error: 'We could not submit your requirement. Please try again, or contact your account manager.' }
  }

  // One row per product (unique per requirement); colour variants of the same
  // product merge into one line with their quantities summed and colours noted.
  const merged = new Map<string, { quantity: number; colours: string[]; notes: string[] }>()
  for (const item of items) {
    const entry = merged.get(item.product_id) || { quantity: 0, colours: [], notes: [] }
    entry.quantity += item.quantity
    const colour = item.variant_id ? colourByVariant.get(item.variant_id) : null
    if (colour) entry.colours.push(`${colour} × ${item.quantity}`)
    if (item.notes && !entry.notes.includes(item.notes)) entry.notes.push(item.notes)
    merged.set(item.product_id, entry)
  }

  if (merged.size > 0) {
    const { error: itemsError } = await admin.from('requirement_products').insert(
      Array.from(merged.entries()).map(([productId, entry]) => ({
        requirement_id: requirement.id,
        product_id: productId,
        quantity: Math.min(entry.quantity, MAX_QTY),
        notes:
          [entry.notes.length ? `Client note: ${entry.notes.join(' / ')}` : '', entry.colours.length ? `Colours: ${entry.colours.join(', ')}` : '', catalogueNote.get(productId) || '']
            .filter(Boolean)
            .join(' · ') || null,
      })),
    )
    if (itemsError) {
      // Don't leave a half-saved requirement behind.
      await admin.from('requirements').delete().eq('id', requirement.id)
      console.error('[portal] requirement items failed', itemsError.message)
      return { error: 'We could not attach the products to your requirement. Nothing was submitted. Please try again.' }
    }
  }

  await admin.from('requirement_events').insert({
    requirement_id: requirement.id,
    actor_id: user.id,
    actor_kind: 'client',
    from_stage: null,
    to_stage: 'submitted',
    note: null,
    visible_to_client: true,
  })

  await notifyRequirementEvent(requirement.id as string, 'submitted')

  revalidatePath('/portal/requirements')
  revalidatePath('/crm/requirements')
  return { success: true, id: requirement.id as string }
}

export async function respondToQuotation(quotationId: string, status: 'accepted' | 'rejected', comment?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership
  const { data: companyId } = await supabase.rpc('client_company_id')
  const { data: quotation } = await supabase
    .from('quotations')
    .select('company_id, status, requirement_id, valid_until')
    .eq('id', quotationId)
    .single()

  if (!quotation || quotation.company_id !== companyId) {
    return { error: 'Quotation not found.' }
  }
  if (quotation.status !== 'sent' && quotation.status !== 'viewed') {
    return { error: 'This quotation can no longer be answered.' }
  }
  if (quotationExpired(quotation.valid_until as string | null)) return { error: EXPIRED_MESSAGE }

  // The database function takes p_accept (boolean), not a status string.
  const { error } = await supabase.rpc('client_respond_quotation', {
    p_quotation_id: quotationId,
    p_accept: status === 'accepted',
    p_comment: comment?.trim().slice(0, 1000) || null,
  })

  if (error) {
    console.error('[portal] respond to quotation failed', error.message)
    return { error: 'We could not record your decision. Please try again.' }
  }
  if (quotation.requirement_id) {
    await notifyRequirementEvent(quotation.requirement_id as string, status === 'accepted' ? 'quotation_accepted' : 'quotation_rejected', comment?.trim().slice(0, 1000) || null)
  }
  revalidatePath(`/portal/quotations/${quotationId}`)
  revalidatePath('/portal/quotations')
  return { success: true }
}

/**
 * Item-by-item response (SOW 3.5): every quotation line is accepted or rejected. The quotation becomes
 * "accepted" when at least one line is accepted, and only accepted lines become the order.
 * If the item-level database function is not installed yet, an all-accept or all-reject answer still works
 * through the original whole-quotation function; a mixed answer is refused rather than silently flattened.
 */
export async function respondToQuotationItems(quotationId: string, decisions: ItemDecision[], comment?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: companyId } = await supabase.rpc('client_company_id')
  const { data: quotation } = await supabase.from('quotations').select('company_id, status, requirement_id, valid_until').eq('id', quotationId).single()
  if (!quotation || quotation.company_id !== companyId) return { error: 'Quotation not found.' }
  if (quotation.status !== 'sent' && quotation.status !== 'viewed') return { error: 'This quotation can no longer be answered.' }
  if (quotationExpired(quotation.valid_until as string | null)) return { error: EXPIRED_MESSAGE }

  const { data: items } = await supabase.from('quotation_items').select('id').eq('quotation_id', quotationId)
  const checked = validateDecisions((items || []).map((i) => i.id as string), decisions)
  if (!checked.ok) return { error: checked.error }

  const text = comment?.trim().slice(0, 1000) || null
  const { error } = await supabase.rpc('client_respond_quotation_items', {
    p_quotation_id: quotationId,
    p_decisions: decisions.map((d) => ({ item_id: d.itemId, accept: d.accept })),
    p_comment: text,
  })

  if (error) {
    const missingFunction = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message)
    const outcome = overallOutcome(decisions)
    if (missingFunction && outcome !== 'partial') {
      return respondToQuotation(quotationId, outcome === 'accepted' ? 'accepted' : 'rejected', text || undefined)
    }
    if (missingFunction) return { error: 'Item-by-item responses are not available yet. Please accept or reject the whole quotation.' }
    console.error('[portal] respond to quotation items failed', error.message)
    if (/every item|does not belong|no longer be answered|not found|no items/i.test(error.message)) return { error: error.message }
    return { error: 'We could not record your decision. Please try again.' }
  }

  if (quotation.requirement_id) {
    await notifyRequirementEvent(quotation.requirement_id as string, overallOutcome(decisions) === 'rejected' ? 'quotation_rejected' : 'quotation_accepted', text)
  }
  revalidatePath(`/portal/quotations/${quotationId}`)
  revalidatePath('/portal/quotations')
  return { success: true }
}
