'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifySampleRequested } from '@/lib/notifications'
import {
  MAX_RESPONSE_COMMENT,
  MAX_RESPONSE_NOTE,
  MAX_RESPONSE_QTY,
  buildResponseItems,
  cleanText,
  saveOpenResponse,
  type ResponseItemInput,
} from '@/lib/catalogues/responses'

/**
 * "Request quotation" on a catalogue: puts every product the client can see in
 * that catalogue on their Shortlist (skipping ones already there), then opens
 * the requirement wizard. RLS limits everything to the caller's own company and
 * to catalogues published to it.
 */
export async function requestCatalogueQuotation(formData: FormData): Promise<{ error?: string }> {
  const campaignId = String(formData.get('campaign_id') || '')
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return { error: 'Catalogue not found.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Your account is not linked to a company yet.' }

  const { data: catalogue } = await supabase.from('campaigns').select('id').eq('id', campaignId).maybeSingle()
  if (!catalogue) return { error: 'This catalogue is not available to you.' }

  const { data: allOfferings } = await supabase.from('campaign_products').select('id, product_id, display_name, moq').eq('campaign_id', campaignId).eq('visibility', 'published')

  // The gifts the client ticked on the catalogue page come with the quantity and note they chose, and those must reach
  // the requirement form (it opens from the shortlist). With nothing ticked, the whole catalogue goes in at its MOQ.
  const chosen = new Map<string, { quantity: number; notes: string | null }>()
  try {
    const parsed = JSON.parse(String(formData.get('selection') || '[]'))
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const id = String(entry?.offering_id ?? '')
        if (!/^[0-9a-f-]{36}$/i.test(id)) continue
        const quantity = Number(entry?.quantity)
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_RESPONSE_QTY) return { error: 'Each quantity must be a whole number of at least 1.' }
        chosen.set(id, { quantity, notes: cleanText(entry?.notes, MAX_RESPONSE_NOTE) || null })
      }
    }
  } catch {
    chosen.clear()
  }
  const offerings = chosen.size ? (allOfferings || []).filter((o) => chosen.has(o.id as string)) : allOfferings
  if (!offerings?.length) return { error: 'This catalogue has no products available to you yet.' }
  const quantityFor = (o: { id: unknown; moq?: unknown }) => chosen.get(o.id as string)?.quantity ?? Math.max(1, Number(o.moq) || 1)
  const notesFor = (o: { id: unknown }) => chosen.get(o.id as string)?.notes ?? null
  for (const o of offerings) {
    const moq = Number(o.moq) || 0
    if (chosen.size && moq > 1 && quantityFor(o) < moq) return { error: `${o.display_name}: the minimum order quantity is ${moq}.` }
  }

  const { data: existing } = await supabase
    .from('company_product_interests')
    .select('id, product_id, user_id')
    .eq('company_id', companyId)
    .is('variant_id', null)
    .in('product_id', offerings.map((o) => o.product_id as string))
  const already = new Map((existing || []).map((r) => [r.product_id as string, r]))

  // Gifts already on the shortlist keep their row but take the quantity just chosen (only the caller's own rows can be changed).
  for (const o of offerings) {
    const row = already.get(o.product_id as string)
    if (!row || row.user_id !== user.id || !chosen.has(o.id as string)) continue
    const { error } = await supabase.from('company_product_interests').update({ quantity: quantityFor(o), notes: notesFor(o) }).eq('id', row.id)
    if (error) return { error: 'Could not update your shortlist. Please try again.' }
  }
  const rows = offerings
    .filter((o) => !already.has(o.product_id as string))
    .map((o) => ({ company_id: companyId, user_id: user.id, product_id: o.product_id, quantity: quantityFor(o), notes: notesFor(o), source_campaign_product_id: o.id }))

  if (rows.length) {
    let { error } = await supabase.from('company_product_interests').insert(rows)
    if (error && /source_campaign_product_id/.test(error.message)) {
      ;({ error } = await supabase.from('company_product_interests').insert(rows.map(({ source_campaign_product_id: _drop, ...rest }) => rest)))
    }
    if (error) return { error: 'Could not add the catalogue products to your shortlist. Please try again.' }
  }

  revalidatePath('/portal/shortlist')
  // The requirement form lists only the gifts chosen in THIS request, not whatever else is still on the shortlist from earlier.
  const scope = offerings.length <= 40 ? `&offerings=${offerings.map((o) => o.id as string).join(',')}` : ''
  redirect(`/portal/requirements/new?catalogue=${campaignId}${scope}`)
}

export type CatalogueResponseResult = { success: true; message: string; unchanged?: boolean } | { error: string }

/**
 * "Send my selection": the client tells their account manager which gifts they want (quantities and notes) and
 * any changes they would like. It is stored as a response linked to this catalogue and company; it does NOT change
 * the catalogue, create a requirement, a quotation or an order. Everything is re-validated here: the company comes
 * from the session, the products must be published offerings this company may see, and prices come from the database.
 */
export async function submitCatalogueResponse(campaignId: string, items: ResponseItemInput[], comment: string): Promise<CatalogueResponseResult> {
  if (!/^[0-9a-f-]{36}$/i.test(String(campaignId))) return { error: 'Catalogue not found.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  const { data: profile } = await supabase.from('profiles').select('role, is_active, full_name').eq('id', user.id).maybeSingle()
  if (!profile || !profile.is_active || (profile.role !== 'client_admin' && profile.role !== 'client_user')) {
    return { error: 'Only client portal users can respond to a catalogue.' }
  }
  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Your account is not linked to a company yet.' }

  // Row-level security: only a catalogue published to this company is returned, and only offerings of products this company may see.
  const { data: catalogue } = await supabase.from('campaigns').select('id, name').eq('id', campaignId).maybeSingle()
  if (!catalogue) return { error: 'This catalogue is not available to you.' }
  const { data: offerings } = await supabase
    .from('campaign_products')
    .select('id, product_id, display_name, selling_price, moq')
    .eq('campaign_id', campaignId)
    .eq('visibility', 'published')

  const text = cleanText(comment, MAX_RESPONSE_COMMENT) || null
  const built = buildResponseItems(items, (offerings || []) as never)
  if (!built.ok) return { error: built.error }
  if (built.items.length === 0 && !text) return { error: 'Select at least one gift, or write a comment for your account manager.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Your response cannot be saved right now. Please contact your account manager.' }
  const saved = await saveOpenResponse(admin, { campaignId, companyId: companyId as string, userId: user.id, items: built.items, comment: text })
  if (!saved.ok) return { error: saved.error }

  if (!saved.unchanged) {
    const { data: company } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle()
    const what = built.items.length > 0 ? `${built.items.length} gift${built.items.length === 1 ? '' : 's'} selected` : 'comments only'
    const { error: notifyError } = await admin.rpc('notify_users', {
      p_audience: 'internal',
      p_company_id: companyId,
      p_title: `Catalogue response from ${company?.name || 'a client'}: ${catalogue.name}`,
      p_body: text ? `${what}. ${text.slice(0, 160)}` : what,
      p_link: '/crm/products/catalogues/responses',
    })
    if (notifyError) console.error('[portal] catalogue response notification failed', notifyError.message)
  }

  revalidatePath(`/portal/catalogues/${campaignId}`)
  revalidatePath('/crm/products/catalogues')
  revalidatePath('/crm/products/catalogues/responses')
  return {
    success: true,
    unchanged: saved.unchanged,
    message: saved.unchanged
      ? 'Your response was already sent. Nothing has changed.'
      : saved.revision > 1
        ? 'Your updated response was sent to your account manager.'
        : 'Your response was sent to your account manager.',
  }
}

export type CatalogueSampleResult = { success: true; message: string } | { error: string }

/**
 * "Request samples" for the gifts the client ticked: one sample request per gift (quantity 1) in the existing
 * sample_requests queue that staff already work from CRM > Samples. A gift that already has a pending sample request
 * from this company is skipped, so pressing the button twice never creates duplicates.
 */
export async function requestCatalogueSamples(campaignId: string, offeringIds: string[], note: string): Promise<CatalogueSampleResult> {
  if (!/^[0-9a-f-]{36}$/i.test(String(campaignId))) return { error: 'Catalogue not found.' }
  const ids = Array.from(new Set((Array.isArray(offeringIds) ? offeringIds : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 50)
  if (ids.length === 0) return { error: 'Tick the gifts you would like samples of.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle()
  if (!profile || !profile.is_active || (profile.role !== 'client_admin' && profile.role !== 'client_user')) {
    return { error: 'Only client portal users can request samples.' }
  }
  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Your account is not linked to a company yet.' }

  // Row-level security: a catalogue published to this company, and offerings of products this company may see.
  const { data: catalogue } = await supabase.from('campaigns').select('id, name').eq('id', campaignId).maybeSingle()
  if (!catalogue) return { error: 'This catalogue is not available to you.' }
  const { data: offerings } = await supabase.from('campaign_products').select('id, product_id, display_name').eq('campaign_id', campaignId).eq('visibility', 'published').in('id', ids)
  if (!offerings?.length || offerings.length !== ids.length) return { error: 'Some gifts are no longer available in this catalogue. Refresh the page and try again.' }

  const productIds = offerings.map((o) => o.product_id as string)
  const { data: pending } = await supabase.from('sample_requests').select('product_id').eq('company_id', companyId).eq('status', 'pending').in('product_id', productIds)
  const requested = new Set((pending || []).map((r) => r.product_id as string))
  const fresh = offerings.filter((o) => !requested.has(o.product_id as string))
  if (fresh.length === 0) return { success: true, message: 'Sample requests for these gifts are already with your account manager.' }

  const text = cleanText(note, 500)
  const notes = `From catalogue "${catalogue.name}".${text ? ` ${text}` : ''}`
  const today = new Date().toISOString().slice(0, 10)
  const { data: inserted, error } = await supabase
    .from('sample_requests')
    .insert(fresh.map((o) => ({ company_id: companyId, requested_by: user.id, product_id: o.product_id, quantity: 1, status: 'pending', notes, requested_date: today })))
    .select('id')
  if (error) return { error: 'We could not send your sample request. Please try again.' }
  for (const row of inserted || []) await notifySampleRequested(row.id as string)

  revalidatePath('/crm/samples')
  revalidatePath('/portal/shortlist')
  const skipped = offerings.length - fresh.length
  return {
    success: true,
    message: `Sample request sent for ${fresh.length} gift${fresh.length === 1 ? '' : 's'}${skipped ? ` (${skipped} already requested)` : ''}. Your account manager will arrange them.`,
  }
}
