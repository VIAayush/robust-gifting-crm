'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifySampleRequested } from '@/lib/notifications'

/**
 * The client portal's single Shortlist. Rows live in company_product_interests
 * (the table the old "Interest List" used, so existing items carry over
 * untouched). RLS limits writes to the caller's own company and user.
 */

type Result = { error?: string; success?: boolean; added?: number; alreadyThere?: boolean }

const MAX_QUANTITY = 100000

async function clientContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' } as const
  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Your account is not linked to a company yet. Please contact your account manager.' } as const
  return { supabase, user, companyId: companyId as string } as const
}

function revalidateShortlist() {
  revalidatePath('/portal/shortlist')
  revalidatePath('/portal/catalogue')
  revalidatePath('/portal/catalogue/product/[id]', 'page')
  revalidatePath('/portal/catalogues', 'layout')
  revalidatePath('/portal/requirements/new')
}

export async function addToShortlist(formData: FormData): Promise<Result> {
  const ctx = await clientContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, user, companyId } = ctx

  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null
  if (!productId) return { error: 'Missing product.' }

  // client_products only returns products this company may see, so a hidden or
  // internal-only product can never be shortlisted by guessing its id.
  const { data: visible } = await supabase.from('client_products').select('id').eq('id', productId).maybeSingle()
  if (!visible) return { error: 'This product is not available in your catalogue.' }

  let existing = supabase
    .from('company_product_interests')
    .select('id')
    .eq('company_id', companyId)
    .eq('product_id', productId)
  existing = variantId ? existing.eq('variant_id', variantId) : existing.is('variant_id', null)
  const { data: existingRows } = await existing.limit(1)
  if (existingRows && existingRows.length > 0) {
    revalidateShortlist()
    return { success: true, alreadyThere: true }
  }

  const sourceOfferingId = String(formData.get('source_offering_id') || '') || null
  const row: Record<string, unknown> = { company_id: companyId, user_id: user.id, product_id: productId, variant_id: variantId, quantity: 1 }
  let { error } = await supabase
    .from('company_product_interests')
    .insert(sourceOfferingId ? { ...row, source_campaign_product_id: sourceOfferingId } : row)
  // Before the catalogues migration the source column doesn't exist yet; save without it.
  if (error && sourceOfferingId && /source_campaign_product_id/.test(error.message)) {
    ;({ error } = await supabase.from('company_product_interests').insert(row))
  }
  if (error) return { error: 'Could not add this product to your shortlist. Please try again.' }

  revalidateShortlist()
  return { success: true }
}

export async function removeFromShortlist(formData: FormData): Promise<Result> {
  const ctx = await clientContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, user, companyId } = ctx

  const id = String(formData.get('id') || '')
  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null

  let query = supabase.from('company_product_interests').delete().eq('company_id', companyId).eq('user_id', user.id)
  if (id) query = query.eq('id', id)
  else if (productId) {
    query = query.eq('product_id', productId)
    query = variantId ? query.eq('variant_id', variantId) : query.is('variant_id', null)
  } else return { error: 'Missing shortlist item.' }

  const { data, error } = await query.select('id')
  if (error) return { error: 'Could not remove this item. Please try again.' }
  if (!data || data.length === 0) return { error: 'Only the teammate who added this item can remove it.' }

  revalidateShortlist()
  return { success: true }
}

export async function updateShortlistItem(formData: FormData): Promise<Result> {
  const ctx = await clientContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, user, companyId } = ctx

  const id = String(formData.get('id') || '')
  const quantity = Number(formData.get('quantity'))
  if (!id) return { error: 'Missing shortlist item.' }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { error: `Quantity must be a whole number between 1 and ${MAX_QUANTITY.toLocaleString('en-IN')}.` }
  }

  const { data, error } = await supabase
    .from('company_product_interests')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .select('id')
  if (error) return { error: 'Could not save the quantity. Please try again.' }
  if (!data || data.length === 0) return { error: 'Only the teammate who added this item can change it.' }

  revalidateShortlist()
  return { success: true }
}

/**
 * One-time carry-over of the old browser-only shortlist (localStorage) into the
 * shared database shortlist, so nothing a client saved before is lost.
 */
export async function importBrowserShortlist(items: { id?: string; sku?: string }[]): Promise<Result> {
  const ctx = await clientContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, user, companyId } = ctx

  const ids = Array.from(new Set(items.map((i) => String(i.id || '')).filter((v) => /^[0-9a-f-]{36}$/i.test(v)))).slice(0, 200)
  const skus = Array.from(new Set(items.map((i) => String(i.sku || '').trim()).filter(Boolean))).slice(0, 200)
  if (ids.length === 0 && skus.length === 0) return { success: true, added: 0 }

  const found = new Set<string>()
  if (ids.length) {
    const { data } = await supabase.from('client_products').select('id').in('id', ids)
    for (const row of data || []) found.add(row.id as string)
  }
  if (skus.length) {
    const { data } = await supabase.from('client_products').select('id').in('sku', skus)
    for (const row of data || []) found.add(row.id as string)
  }
  if (found.size === 0) return { success: true, added: 0 }

  const { data: existing } = await supabase
    .from('company_product_interests')
    .select('product_id')
    .eq('company_id', companyId)
    .is('variant_id', null)
    .in('product_id', Array.from(found))
  const already = new Set((existing || []).map((r) => r.product_id as string))
  const toAdd = Array.from(found).filter((id) => !already.has(id))
  if (toAdd.length === 0) return { success: true, added: 0 }

  const { error } = await supabase.from('company_product_interests').insert(
    toAdd.map((productId) => ({ company_id: companyId, user_id: user.id, product_id: productId, quantity: 1 })),
  )
  if (error) return { error: 'Could not move your saved items into the shortlist.' }

  revalidateShortlist()
  return { success: true, added: toAdd.length }
}

/**
 * Customer-facing sample request. Writes a sample_requests row (status defaults
 * to 'pending'); staff review and fulfil it from CRM > Samples.
 */
export async function submitSampleRequest(formData: FormData): Promise<Result> {
  const ctx = await clientContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, user, companyId } = ctx

  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null
  const quantity = Number(formData.get('quantity') || 1)
  const notes = String(formData.get('notes') || '').trim().slice(0, 1000) || null
  const customizationNotes = String(formData.get('customization_notes') || '').trim().slice(0, 1000) || null

  if (!productId) return { error: 'Missing product.' }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return { error: 'Sample quantity must be a whole number between 1 and 999.' }
  }

  const { data: visible } = await supabase.from('client_products').select('id').eq('id', productId).maybeSingle()
  if (!visible) return { error: 'This product is not available in your catalogue.' }

  const { data: inserted, error } = await supabase
    .from('sample_requests')
    .insert({
      company_id: companyId,
      requested_by: user.id,
      product_id: productId,
      variant_id: variantId,
      quantity,
      notes,
      customization_notes: customizationNotes,
      requested_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()
  if (error) return { error: 'We could not send your sample request. Please try again.' }

  if (inserted?.id) await notifySampleRequested(inserted.id)

  revalidatePath('/portal/shortlist')
  revalidatePath('/crm/samples')
  return { success: true }
}
