'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getAllowedModules } from '@/lib/module-access'
import { writeAudit } from '@/lib/audit'
import { isIndividualCompany } from '@/lib/companies/individual'
import { findCatalogueCandidateIds, type CandidateFilter } from '@/lib/catalogues/candidates'

type Result = { error?: string; success?: boolean; added?: number; message?: string }

const BASE = '/crm/products/catalogues'
const MAX_ADD = 2000

/** Catalogue writes: Catalogues module + a role that can edit sales data (admin / sales). */
async function editor() {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { error: 'Your session has expired. Please sign in again.' } as const
  const { modules } = await getAllowedModules()
  if (!modules.has('catalogues')) return { error: 'You do not have access to Catalogues.' } as const
  if (profile.role !== 'admin' && profile.role !== 'sales') return { error: 'Your role can view catalogues but not change them.' } as const
  const supabase = await createClient()
  return { profile, supabase } as const
}

async function event(supabase: SupabaseClient, campaignId: string, type: string, payload: Record<string, unknown> = {}) {
  await supabase.rpc('record_campaign_event', { p_campaign_id: campaignId, p_event_type: type, p_payload: payload })
}

function text(formData: FormData, key: string, max: number) {
  return String(formData.get(key) || '').trim().slice(0, max)
}

function revalidateCatalogue(id?: string) {
  revalidatePath(BASE)
  if (id) revalidatePath(`${BASE}/${id}`)
  revalidatePath('/portal/catalogues', 'layout')
}

function readDetails(formData: FormData): { error?: string; values?: Record<string, unknown> } {
  const name = text(formData, 'name', 120)
  if (!name) return { error: 'Give the catalogue a name.' }
  const budgetRaw = text(formData, 'budget_per_employee', 20)
  let budget = 0
  if (budgetRaw) {
    budget = Number(budgetRaw)
    if (!Number.isFinite(budget) || budget < 0) return { error: 'Budget per person must be 0 or more.' }
    if (budget > 10_000_000) return { error: 'Budget per person looks too large.' }
  }
  return {
    values: {
      name,
      occasion: text(formData, 'occasion', 120) || null,
      description: text(formData, 'description', 2000) || null,
      budget_per_employee: Math.round(budget * 100) / 100,
    },
  }
}

export async function createCatalogue(formData: FormData): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const details = readDetails(formData)
  if (details.error) return { error: details.error }

  const { data, error } = await ctx.supabase
    .from('campaigns')
    .insert({ ...details.values, owner_id: ctx.profile.id, status: 'planning', employee_quantity: 1, total_budget: 0 })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[catalogues] create failed', error?.message)
    return { error: 'The catalogue could not be created. If this keeps happening, the database migration may not have been run yet.' }
  }
  await writeAudit(ctx.supabase, { action: 'create_catalogue', entity: 'campaigns', entityId: data.id, next: details.values, userId: ctx.profile.id })
  await event(ctx.supabase, data.id, 'catalogue_created')
  revalidateCatalogue()
  redirect(`${BASE}/${data.id}`)
}

export async function updateCatalogueDetails(formData: FormData): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const id = text(formData, 'id', 40)
  const details = readDetails(formData)
  if (details.error) return { error: details.error }
  const { error } = await ctx.supabase.from('campaigns').update(details.values!).eq('id', id)
  if (error) return { error: 'Could not save the catalogue details.' }
  await writeAudit(ctx.supabase, { action: 'update_catalogue', entity: 'campaigns', entityId: id, next: details.values, userId: ctx.profile.id })
  revalidateCatalogue(id)
  return { success: true, message: 'Details saved.' }
}

export async function setCatalogueCompanies(campaignId: string, companyIds: string[]): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const ids = Array.from(new Set(companyIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 500)

  // Individual (B2C) customers can never be assigned a corporate catalogue.
  if (ids.length) {
    const { data: companies } = await ctx.supabase.from('companies').select('id, name, company_type').in('id', ids)
    const valid = (companies || []).filter((c) => !isIndividualCompany(c))
    if (valid.length !== ids.length) return { error: 'Some selected companies are individual customers or no longer exist.' }
  }

  const { data: current, error: readError } = await ctx.supabase.from('campaign_companies').select('company_id').eq('campaign_id', campaignId)
  if (readError) return { error: 'Company assignment needs the latest database migration. Please run it and try again.' }
  const currentIds = new Set((current || []).map((r) => r.company_id as string))
  const toAdd = ids.filter((id) => !currentIds.has(id))
  const toRemove = Array.from(currentIds).filter((id) => !ids.includes(id))

  if (toRemove.length) {
    const { error } = await ctx.supabase.from('campaign_companies').delete().eq('campaign_id', campaignId).in('company_id', toRemove)
    if (error) return { error: 'Could not update the assigned companies.' }
  }
  if (toAdd.length) {
    const { error } = await ctx.supabase
      .from('campaign_companies')
      .insert(toAdd.map((companyId) => ({ campaign_id: campaignId, company_id: companyId, assigned_by: ctx.profile.id })))
    if (error) return { error: 'Could not update the assigned companies.' }
  }
  // Keep the legacy single company column pointing at one of the assigned companies.
  await ctx.supabase.from('campaigns').update({ company_id: ids[0] ?? null }).eq('id', campaignId)

  await writeAudit(ctx.supabase, {
    action: 'assign_catalogue',
    entity: 'campaigns',
    entityId: campaignId,
    previous: { company_ids: Array.from(currentIds) },
    next: { company_ids: ids },
    userId: ctx.profile.id,
  })
  await event(ctx.supabase, campaignId, 'catalogue_assigned', { added: toAdd, removed: toRemove })
  revalidateCatalogue(campaignId)
  return { success: true, message: `Assigned to ${ids.length} compan${ids.length === 1 ? 'y' : 'ies'}.` }
}

export async function setCataloguePublished(formData: FormData): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const id = text(formData, 'id', 40)
  const publish = String(formData.get('publish')) === 'true'

  if (publish) {
    const [{ count: productCount }, { count: companyCount }] = await Promise.all([
      ctx.supabase.from('campaign_products').select('id', { count: 'exact', head: true }).eq('campaign_id', id),
      ctx.supabase.from('campaign_companies').select('company_id', { count: 'exact', head: true }).eq('campaign_id', id),
    ])
    if (!productCount) return { error: 'Add at least one product before publishing.' }
    if (!companyCount) return { error: 'Assign at least one company before publishing.' }
    const now = new Date().toISOString()
    const { error: offeringsError } = await ctx.supabase
      .from('campaign_products')
      .update({ visibility: 'published', published_at: now, published_by: ctx.profile.id })
      .eq('campaign_id', id)
      .neq('visibility', 'published')
    if (offeringsError) return { error: 'Could not publish the catalogue products.' }
    const { error } = await ctx.supabase.from('campaigns').update({ published_to_client_at: now, status: 'published_to_client' }).eq('id', id)
    if (error) return { error: 'Could not publish the catalogue.' }
  } else {
    const { error } = await ctx.supabase.from('campaigns').update({ published_to_client_at: null, status: 'planning' }).eq('id', id)
    if (error) return { error: 'Could not unpublish the catalogue.' }
  }

  await writeAudit(ctx.supabase, { action: publish ? 'publish_catalogue' : 'unpublish_catalogue', entity: 'campaigns', entityId: id, userId: ctx.profile.id })
  await event(ctx.supabase, id, publish ? 'catalogue_published' : 'catalogue_unpublished')
  revalidateCatalogue(id)
  return { success: true, message: publish ? 'Published. Assigned companies can now see it in their portal.' : 'Unpublished. Clients can no longer see it.' }
}

export async function duplicateCatalogue(formData: FormData): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const id = text(formData, 'id', 40)
  const { data: source } = await ctx.supabase.from('campaigns').select('name, occasion, description, budget_per_employee').eq('id', id).maybeSingle()
  if (!source) return { error: 'Catalogue not found.' }

  const { data: copy, error } = await ctx.supabase
    .from('campaigns')
    .insert({
      name: `${source.name} (copy)`.slice(0, 120),
      occasion: source.occasion,
      description: source.description,
      budget_per_employee: source.budget_per_employee,
      employee_quantity: 1,
      total_budget: 0,
      owner_id: ctx.profile.id,
      status: 'planning',
    })
    .select('id')
    .single()
  if (error || !copy) return { error: 'Could not duplicate the catalogue.' }

  const { data: offerings } = await ctx.supabase
    .from('campaign_products')
    .select('product_id, display_name, client_description, client_image_url, selling_price, discount_percent, quantity_limit, moq, display_order')
    .eq('campaign_id', id)
  if (offerings?.length) {
    const { error: copyError } = await ctx.supabase
      .from('campaign_products')
      .insert(offerings.map((o) => ({ ...o, campaign_id: copy.id, visibility: 'draft', created_by: ctx.profile.id })))
    if (copyError) {
      await ctx.supabase.from('campaigns').delete().eq('id', copy.id)
      return { error: 'Could not copy the catalogue products.' }
    }
  }
  await writeAudit(ctx.supabase, { action: 'duplicate_catalogue', entity: 'campaigns', entityId: copy.id, previous: { source_id: id }, userId: ctx.profile.id })
  await event(ctx.supabase, copy.id, 'catalogue_created', { duplicated_from: id })
  revalidateCatalogue()
  redirect(`${BASE}/${copy.id}?duplicated=1`)
}

/** Deletes the catalogue (its offerings and assignments cascade). Products themselves are never touched. */
export async function deleteCatalogue(formData: FormData): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const id = text(formData, 'id', 40)
  const { count: orderCount } = await ctx.supabase.from('orders').select('id', { count: 'exact', head: true }).eq('campaign_id', id)
  if (orderCount) {
    return { error: 'This catalogue has orders linked to it, so it can’t be deleted. Unpublish it instead.' }
  }
  const { data: existing } = await ctx.supabase.from('campaigns').select('name').eq('id', id).maybeSingle()
  const { error } = await ctx.supabase.from('campaigns').delete().eq('id', id)
  if (error) return { error: 'The catalogue could not be deleted.' }
  await writeAudit(ctx.supabase, { action: 'delete_catalogue', entity: 'campaigns', entityId: id, previous: existing, userId: ctx.profile.id })
  revalidateCatalogue()
  redirect(`${BASE}?deleted=1`)
}

async function insertOfferings(ctx: { supabase: SupabaseClient; profile: { id: string } }, campaignId: string, productIds: string[]) {
  const { data: campaign } = await ctx.supabase.from('campaigns').select('published_to_client_at').eq('id', campaignId).maybeSingle()
  if (!campaign) return { error: 'Catalogue not found.' }
  const { data: existing } = await ctx.supabase.from('campaign_products').select('product_id, display_order').eq('campaign_id', campaignId)
  const already = new Set((existing || []).map((r) => r.product_id as string))
  let order = Math.max(0, ...(existing || []).map((r) => Number(r.display_order) || 0))
  const ids = productIds.filter((id) => !already.has(id))
  if (ids.length === 0) return { added: 0, skipped: 0 }

  let added = 0
  let skipped = 0
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data: products, error } = await ctx.supabase
      .from('products')
      .select('id, name, description, image_url, price, moq')
      .eq('status', 'active')
      .gt('price', 0)
      .in('id', chunk)
    if (error) return { error: 'Could not read the selected products.' }
    skipped += chunk.length - (products || []).length
    const now = new Date().toISOString()
    const rows = (products || []).map((p) => ({
      campaign_id: campaignId,
      product_id: p.id,
      display_name: p.name,
      client_description: p.description,
      client_image_url: p.image_url,
      selling_price: Number(p.price) || 0,
      moq: p.moq || 1,
      display_order: ++order,
      visibility: campaign.published_to_client_at ? 'published' : 'draft',
      published_at: campaign.published_to_client_at ? now : null,
      published_by: campaign.published_to_client_at ? ctx.profile.id : null,
      created_by: ctx.profile.id,
    }))
    if (rows.length) {
      const { error: insertError } = await ctx.supabase.from('campaign_products').insert(rows)
      if (insertError) return { error: 'Some products could not be added. Please try again.' }
      added += rows.length
    }
  }
  return { added, skipped }
}

function addedMessage(added: number, skipped: number, none: string) {
  const base = added ? `Added ${added} product${added === 1 ? '' : 's'}.` : none
  return skipped ? `${base} ${skipped} skipped (no price or not active).` : base
}

export async function addCatalogueProducts(campaignId: string, productIds: string[]): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const ids = Array.from(new Set(productIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, MAX_ADD)
  if (ids.length === 0) return { error: 'Tick at least one product to add.' }
  const res = await insertOfferings(ctx, campaignId, ids)
  if ('error' in res) return { error: res.error }
  await writeAudit(ctx.supabase, { action: 'add_catalogue_products', entity: 'campaigns', entityId: campaignId, next: { count: res.added }, userId: ctx.profile.id })
  revalidateCatalogue(campaignId)
  return { success: true, added: res.added, message: addedMessage(res.added, res.skipped ?? 0, 'Those products are already in this catalogue.') }
}

/** "Select all N matching": the same filter the screen used, resolved again on the server. */
export async function addCatalogueProductsByFilter(campaignId: string, filter: CandidateFilter): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const ids = await findCatalogueCandidateIds(ctx.supabase, filter, MAX_ADD + 1, { pricedOnly: true })
  if (ids.length > MAX_ADD) return { error: `That filter matches more than ${MAX_ADD} products. Narrow it down and try again.` }
  if (ids.length === 0) return { error: 'No products match this filter.' }
  const res = await insertOfferings(ctx, campaignId, ids)
  if ('error' in res) return { error: res.error }
  await writeAudit(ctx.supabase, {
    action: 'add_catalogue_products',
    entity: 'campaigns',
    entityId: campaignId,
    next: { count: res.added, filter },
    userId: ctx.profile.id,
  })
  revalidateCatalogue(campaignId)
  return { success: true, added: res.added, message: addedMessage(res.added, res.skipped ?? 0, 'All matching products are already in this catalogue.') }
}

export async function updateCatalogueItem(formData: FormData): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const id = text(formData, 'id', 40)
  const campaignId = text(formData, 'campaign_id', 40)
  const price = Number(formData.get('selling_price'))
  const moq = Number(formData.get('moq'))
  if (!Number.isFinite(price) || price <= 0) return { error: 'Selling price must be more than ₹0.' }
  if (!Number.isInteger(moq) || moq < 1) return { error: 'MOQ must be a whole number of at least 1.' }
  const { error } = await ctx.supabase
    .from('campaign_products')
    .update({ selling_price: Math.round(price * 100) / 100, moq, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('campaign_id', campaignId)
  if (error) return { error: 'Could not save this product.' }
  revalidateCatalogue(campaignId)
  return { success: true }
}

export async function removeCatalogueItems(campaignId: string, offeringIds: string[]): Promise<Result> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  const ids = offeringIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!ids.length) return { error: 'Nothing selected.' }
  const { error } = await ctx.supabase.from('campaign_products').delete().eq('campaign_id', campaignId).in('id', ids)
  if (error) return { error: 'Could not remove the selected products.' }
  await writeAudit(ctx.supabase, { action: 'remove_catalogue_products', entity: 'campaigns', entityId: campaignId, next: { count: ids.length }, userId: ctx.profile.id })
  revalidateCatalogue(campaignId)
  return { success: true, message: `Removed ${ids.length} product${ids.length === 1 ? '' : 's'} from the catalogue.` }
}

/**
 * "Select all N matching": every eligible id for the filter across all pages. Eligible means active, priced (> 0)
 * and not already in the catalogue. Read-only; the ids still go through addCatalogueProducts to be added.
 */
export async function selectCatalogueCandidateIds(campaignId: string, filter: CandidateFilter): Promise<{ error?: string; ids?: string[] }> {
  const ctx = await editor()
  if ('error' in ctx) return { error: ctx.error }
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return { error: 'Catalogue not found.' }
  const safe: CandidateFilter = { ...filter, mode: filter?.mode === 'supplier' ? 'supplier' : 'search' }
  const { data: existing, error: existingError } = await ctx.supabase.from('campaign_products').select('product_id').eq('campaign_id', campaignId)
  if (existingError) return { error: 'Could not read this catalogue.' }
  const already = new Set((existing || []).map((r) => r.product_id as string))
  let found: string[]
  try {
    found = await findCatalogueCandidateIds(ctx.supabase, safe, MAX_ADD + already.size + 1, { pricedOnly: true })
  } catch {
    return { error: 'Could not load the matching products. Please try again.' }
  }
  const ids = found.filter((id) => !already.has(id))
  if (ids.length > MAX_ADD) return { error: `That filter matches more than ${MAX_ADD} products. Narrow it down and try again.` }
  return { ids }
}
