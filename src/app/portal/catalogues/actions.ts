'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  const { data: offerings } = await supabase.from('campaign_products').select('id, product_id').eq('campaign_id', campaignId).eq('visibility', 'published')
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
