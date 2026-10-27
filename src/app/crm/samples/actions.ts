'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

const SAMPLE_ROLES = ['admin', 'sales', 'operations'] as const

async function requireSampleAccess() {
  const profile = await getProfile()
  if (!profile) return { ok: false as const, error: 'Not authenticated' }
  if (!SAMPLE_ROLES.includes(profile.role as (typeof SAMPLE_ROLES)[number])) {
    return { ok: false as const, error: 'Not permitted to manage samples' }
  }
  return { ok: true as const, profile }
}

function fail(message: string): never {
  redirect(`/crm/samples?error=${encodeURIComponent(message)}`)
}

function ok(flag: 'received' | 'moved'): never {
  revalidatePath('/crm/samples')
  redirect(`/crm/samples?${flag}=1`)
}

const HOLDERS = {
  office: 'in_office',
  team: 'with_team',
  client: 'with_client',
  supplier: 'pending_supplier',
} as const

type Holder = keyof typeof HOLDERS

/** Pre-migration path (read, then write). Only used while receive_sample is not installed. */
async function receiveSampleLegacy(supabase: Awaited<ReturnType<typeof createClient>>, productId: string, quantity: number, unitCost: number) {
  const { data: existing, error: existingError } = await supabase.from('sample_stock').select('id, in_office, unit_cost').eq('product_id', productId).maybeSingle()
  if (existingError) fail(existingError.message)
  if (existing) {
    const { error } = await supabase.from('sample_stock').update({ in_office: (existing.in_office || 0) + quantity, unit_cost: unitCost || existing.unit_cost }).eq('id', existing.id)
    if (error) fail(error.message)
  } else {
    const { error } = await supabase.from('sample_stock').insert({ product_id: productId, in_office: quantity, with_team: 0, with_client: 0, pending_supplier: 0, unit_cost: unitCost || 0 })
    if (error) fail(error.message)
  }
  const { data: { user } } = await supabase.auth.getUser()
  const { error: movementError } = await supabase.from('sample_movements').insert({ product_id: productId, quantity, from_holder: 'supplier', to_holder: 'office', cost: unitCost || 0, note: 'Received into office sample stock', created_by: user?.id })
  if (movementError) fail(movementError.message)
}

export async function receiveSample(formData: FormData) {
  const access = await requireSampleAccess()
  if (!access.ok) fail(access.error)

  const supabase = await createClient()
  const productId = String(formData.get('product_id') || '').trim()
  const quantity = Number(formData.get('quantity') || 0)
  const unitCost = Number(formData.get('unit_cost') || 0)
  if (!productId) fail('Select a product to receive into office.')
  if (!Number.isInteger(quantity) || quantity < 1) fail('Enter a positive whole quantity.')
  if (!Number.isFinite(unitCost) || unitCost < 0) fail('Unit cost cannot be negative.')

  const { error: rpcError } = await supabase.rpc('receive_sample', {
    p_product_id: productId,
    p_quantity: quantity,
    p_unit_cost: unitCost || 0,
    p_note: 'Received into office sample stock',
  })
  if (rpcError) {
    const missing = rpcError.code === 'PGRST202' || rpcError.code === '42883' || /could not find the function/i.test(rpcError.message)
    if (!missing) {
      console.error('[samples] receive_sample failed', rpcError.message)
      fail(friendlyMoveError(rpcError.message))
    }
    // Migration 20261034 not applied yet: keep the previous behaviour until it is.
    await receiveSampleLegacy(supabase, productId, quantity, unitCost)
  }

  ok('received')
}

/** Convenience wrapper over moveSample for the top-level "Send to client" bar — resolves a product straight to its (single) stock row, always moving from office. */
export async function sendSampleToClient(formData: FormData) {
  const access = await requireSampleAccess()
  if (!access.ok) fail(access.error)

  const supabase = await createClient()
  const productId = String(formData.get('product_id') || '').trim()
  const companyId = String(formData.get('company_id') || '').trim()
  const quantity = String(formData.get('quantity') || '')
  if (!productId) fail('Select a product to send.')
  if (!companyId) fail('Select the client receiving the sample.')

  const { data: stock, error } = await supabase.from('sample_stock').select('id').eq('product_id', productId).maybeSingle()
  if (error) fail(error.message)
  if (!stock) fail('No samples in office for this product yet — receive some first.')

  const movementForm = new FormData()
  movementForm.set('stock_id', stock.id)
  movementForm.set('from_holder', 'office')
  movementForm.set('to_holder', 'client')
  movementForm.set('quantity', quantity)
  movementForm.set('company_id', companyId)
  return moveSample(movementForm)
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Core stock-movement write, shared by moveSample (redirect-based form
 * action) and fulfillSampleRequest (which also has a sample_requests row to
 * update afterward, so it can't call a redirect()-throwing action directly).
 */
async function performSampleMovement(
  supabase: Supabase,
  userId: string | undefined,
  params: { stockId: string; from: Holder; to: Holder; quantity: number; companyId: string | null; note: string | null }
): Promise<{ movementId: string } | { error: string }> {
  const { stockId, from, to, quantity, companyId, note } = params
  if (!stockId || !(from in HOLDERS) || !(to in HOLDERS) || from === to || !Number.isInteger(quantity) || quantity < 1) {
    return { error: 'Valid movement details are required.' }
  }
  if (to === 'client' && !companyId) return { error: 'Select the client receiving the sample.' }

  const { data: stock, error: stockError } = await supabase.from('sample_stock').select('product_id, unit_cost').eq('id', stockId).single()
  if (stockError || !stock) return { error: 'Sample stock not found.' }

  // One database transaction: the row is locked, the counts change and the ledger row is written together, so two
  // people moving the same product at once can never corrupt the counts or leave a movement unrecorded.
  const { data, error } = await supabase.rpc('move_sample', {
    p_product_id: stock.product_id,
    p_quantity: quantity,
    p_from: from,
    p_to: to,
    p_company_id: to === 'client' || from === 'client' ? companyId : null,
    p_requirement_id: null,
    p_cost: Number(stock.unit_cost) || 0,
    p_note: note,
  })
  if (error) {
    console.error('[samples] move_sample failed', error.message)
    return { error: friendlyMoveError(error.message) }
  }

  // The current function returns the movement id. Before the migration it returned nothing, so look the row up.
  let movementId = typeof data === 'string' ? data : null
  if (!movementId) {
    const { data: latest } = await supabase
      .from('sample_movements')
      .select('id')
      .eq('product_id', stock.product_id)
      .eq('created_by', userId ?? '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    movementId = (latest?.id as string | undefined) ?? null
  }
  if (!movementId) return { error: 'The sample was moved, but its history entry could not be found.' }
  return { movementId }
}

/** Messages raised on purpose by the database functions are safe to show; anything else gets a generic line. */
function friendlyMoveError(message: string) {
  if (/not enough samples|quantity must be positive|invalid sample location|not permitted|unit cost/i.test(message)) return message
  return 'Could not record the movement. Nothing was changed.'
}

export async function moveSample(formData: FormData) {
  const access = await requireSampleAccess()
  if (!access.ok) fail(access.error)

  const supabase = await createClient()
  const stockId = String(formData.get('stock_id') || '')
  const from = String(formData.get('from_holder') || '') as Holder
  const to = String(formData.get('to_holder') || '') as Holder
  const quantity = Number(formData.get('quantity') || 0)
  const companyId = String(formData.get('company_id') || '') || null
  const note = String(formData.get('note') || '') || null

  const result = await performSampleMovement(supabase, access.profile.id, { stockId, from, to, quantity, companyId, note })
  if ('error' in result) fail(result.error)

  ok('moved')
}

function failRequests(message: string): never {
  redirect(`/crm/samples?tab=requests&error=${encodeURIComponent(message)}`)
}

function okRequests(flag: 'updated' | 'fulfilled'): never {
  revalidatePath('/crm/samples')
  redirect(`/crm/samples?tab=requests&${flag}=1`)
}

/** Staff approves or rejects an incoming customer sample request — status only, no stock movement yet. */
export async function updateSampleRequestStatus(formData: FormData) {
  const access = await requireSampleAccess()
  if (!access.ok) failRequests(access.error)

  const supabase = await createClient()
  const requestId = String(formData.get('request_id') || '')
  const status = String(formData.get('status') || '')
  if (!requestId) failRequests('Missing sample request.')
  if (status !== 'approved' && status !== 'rejected') failRequests('Invalid status.')

  // Only an open request (pending or approved) can be approved or rejected; a shipped one is final.
  const { data: changed, error } = await supabase
    .from('sample_requests')
    .update({ status, assigned_to: access.profile.id })
    .eq('id', requestId)
    .in('status', ['pending', 'approved'])
    .select('id')
    .maybeSingle()
  if (error) failRequests(error.message)
  if (!changed) failRequests('This request has already been handled.')

  okRequests('updated')
}

/**
 * Ships an approved (or pending) customer sample request: performs the same
 * office → client stock movement sendSampleToClient does, then marks the
 * request 'shipped' and links it to the resulting sample_movements row so
 * the existing Samples page stays the single source of truth for stock.
 */
export async function fulfillSampleRequest(formData: FormData) {
  const access = await requireSampleAccess()
  if (!access.ok) failRequests(access.error)

  const supabase = await createClient()
  const requestId = String(formData.get('request_id') || '')
  if (!requestId) failRequests('Missing sample request.')

  const { data: request, error: requestError } = await supabase
    .from('sample_requests')
    .select('id, product_id, company_id, quantity, status')
    .eq('id', requestId)
    .single()
  if (requestError || !request) failRequests(requestError?.message || 'Sample request not found.')
  // A request is fulfilled once: shipped or rejected requests never move stock again.
  if (request.status !== 'pending' && request.status !== 'approved') failRequests('This request has already been handled.')

  const { data: stock, error: stockError } = await supabase
    .from('sample_stock')
    .select('id')
    .eq('product_id', request.product_id)
    .maybeSingle()
  if (stockError) failRequests(stockError.message)
  if (!stock) failRequests('No samples in office for this product yet — receive some first.')

  const previousStatus = request.status
  // Claim the request BEFORE moving stock: of two simultaneous clicks only one wins, so stock is never moved twice.
  const { data: claimed } = await supabase
    .from('sample_requests')
    .update({ status: 'shipped', assigned_to: access.profile.id })
    .eq('id', requestId)
    .in('status', ['pending', 'approved'])
    .select('id')
    .maybeSingle()
  if (!claimed) failRequests('This request has already been handled.')

  const result = await performSampleMovement(supabase, access.profile.id, {
    stockId: stock.id,
    from: 'office',
    to: 'client',
    quantity: request.quantity || 1,
    companyId: request.company_id,
    note: 'Fulfilled from customer sample request',
  })
  if ('error' in result) {
    // Nothing moved, so the request goes back to what it was and can be tried again.
    await supabase.from('sample_requests').update({ status: previousStatus }).eq('id', requestId).eq('status', 'shipped')
    failRequests(result.error)
  }

  const { error: updateError } = await supabase
    .from('sample_requests')
    .update({ fulfilled_via_movement_id: result.movementId })
    .eq('id', requestId)
  if (updateError) failRequests(updateError.message)

  okRequests('fulfilled')
}
