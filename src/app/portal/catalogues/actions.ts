'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_RESPONSE_COMMENT,
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

  const { data: allOfferings } = await supabase.from('campaign_products').select('id, product_id').eq('campaign_id', campaignId).eq('visibility', 'published')
  // The client may have ticked specific gifts on the catalogue page; only those go to the shortlist. With nothing ticked, the whole catalogue does.
  let selectedIds: string[] = []
  try {
    const parsed = JSON.parse(String(formData.get('offering_ids') || '[]'))
    if (Array.isArray(parsed)) selectedIds = parsed.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  } catch {
    selectedIds = []
  }
  const offerings = selectedIds.length ? (allOfferings || []).filter((o) => selectedIds.includes(o.id as string)) : allOfferings
  if (!offerings?.length) return { error: 'This catalogue has no products available to you yet.' }

  const { data: existing } = await supabase
    .from('company_product_interests')
    .select('product_id')
    .eq('company_id', companyId)
    .is('variant_id', null)
    .in('product_id', offerings.map((o) => o.product_id as string))
  const already = new Set((existing || []).map((r) => r.product_id as string))
  const rows = offerings
    .filter((o) => !already.has(o.product_id as string))
    .map((o) => ({ company_id: companyId, user_id: user.id, product_id: o.product_id, quantity: 1, source_campaign_product_id: o.id }))

  if (rows.length) {
    let { error } = await supabase.from('company_product_interests').insert(rows)
    if (error && /source_campaign_product_id/.test(error.message)) {
      ;({ error } = await supabase.from('company_product_interests').insert(rows.map(({ source_campaign_product_id: _drop, ...rest }) => rest)))
    }
    if (error) return { error: 'Could not add the catalogue products to your shortlist. Please try again.' }
  }

  revalidatePath('/portal/shortlist')
  redirect(`/portal/requirements/new?catalogue=${campaignId}`)
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
