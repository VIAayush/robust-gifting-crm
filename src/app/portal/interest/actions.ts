'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Persistent, DB-backed replacement for the browser-localStorage-only
 * catalogue shortlist — see company_product_interests (migration
 * 20260923_b2b_interest_and_sample_requests.sql). RLS already restricts
 * writes to the caller's own company + user, so this only needs to resolve
 * those two ids and let Postgres enforce the rest.
 */
export async function toggleCompanyInterest(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Company not found' }

  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null
  const remove = String(formData.get('remove') || '') === '1'

  if (!productId) return { error: 'Missing product' }

  let existingQuery = supabase
    .from('company_product_interests')
    .select('id')
    .eq('product_id', productId)
    .eq('user_id', user.id)
  existingQuery = variantId ? existingQuery.eq('variant_id', variantId) : existingQuery.is('variant_id', null)
  const { data: existingRow } = await existingQuery.maybeSingle()

  if (remove) {
    if (existingRow) {
      const { error } = await supabase.from('company_product_interests').delete().eq('id', existingRow.id)
      if (error) return { error: error.message }
    }
  } else if (!existingRow) {
    const { error } = await supabase.from('company_product_interests').insert({
      company_id: companyId,
      user_id: user.id,
      product_id: productId,
      variant_id: variantId,
    })
    if (error) return { error: error.message }
  }

  revalidatePath('/portal/catalogue')
  revalidatePath('/portal/catalogue/product/[id]', 'page')
  revalidatePath('/portal/interest')
  return { success: true }
}

export async function toggleCompanyInterestForm(formData: FormData): Promise<void> {
  await toggleCompanyInterest(formData)
}

export async function removeCompanyInterest(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const interestId = String(formData.get('interest_id') || '')
  if (!interestId) return { error: 'Missing interest' }

  const { error } = await supabase.from('company_product_interests').delete().eq('id', interestId).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/portal/interest')
  return { success: true }
}

export async function removeCompanyInterestForm(formData: FormData): Promise<void> {
  await removeCompanyInterest(formData)
}

/**
 * Customer-facing sample request. Writes a sample_requests row (status
 * defaults to 'pending') — staff review and fulfil it from /crm/samples,
 * which re-uses the existing sendSampleToClient action and links the
 * resulting sample_movements row back via fulfilled_via_movement_id.
 */
export async function submitSampleRequest(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { error: 'Company not found' }

  const productId = String(formData.get('product_id') || '')
  const variantId = String(formData.get('variant_id') || '') || null
  const quantity = Number(formData.get('quantity') || 1)
  const notes = String(formData.get('notes') || '').trim() || null

  if (!productId) return { error: 'Missing product' }

  const { error } = await supabase.from('sample_requests').insert({
    company_id: companyId,
    requested_by: user.id,
    product_id: productId,
    variant_id: variantId,
    quantity: quantity > 0 ? quantity : 1,
    notes,
    requested_date: new Date().toISOString().slice(0, 10),
  })
  if (error) return { error: error.message }

  revalidatePath('/portal/interest')
  revalidatePath('/crm/samples')
  return { success: true }
}
