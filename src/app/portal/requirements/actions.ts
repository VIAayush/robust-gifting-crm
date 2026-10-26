'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyRequirementEvent } from '@/lib/notifications'
import {
  budgetStatus,
  clientCanResubmit,
  clientCanSelectProducts,
  selectionTotals,
  totalBudget,
} from '@/lib/requirements/workflow'

export type ActionResult = { success: true; message?: string } | { error: string }

const MAX_QTY = 1_000_000
const MAX_ITEMS = 200
const MAX_NOTE = 1000

type Gate =
  | { ok: false; error: string }
  | {
      ok: true
      userId: string
      requirement: {
        id: string
        name: string
        company_id: string
        workflow_stage: string | null
        budget: number | null
        quantity: number | null
      }
    }

/** The caller must be an active client user and the requirement must belong to their company. */
async function gate(requirementId: string): Promise<Gate> {
  if (!/^[0-9a-f-]{36}$/i.test(requirementId)) return { ok: false, error: 'Requirement not found.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' }
  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle()
  if (!profile || !profile.is_active || (profile.role !== 'client_admin' && profile.role !== 'client_user')) {
    return { ok: false, error: 'Only client portal users can do this.' }
  }
  const { data: companyId } = await supabase.rpc('client_company_id')
  if (!companyId) return { ok: false, error: 'Your account is not linked to a company yet.' }
  const { data: requirement } = await supabase
    .from('requirements')
    .select('id, name, company_id, workflow_stage, budget, quantity')
    .eq('id', requirementId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!requirement) return { ok: false, error: 'Requirement not found.' }
  return { ok: true, userId: user.id, requirement: requirement as Extract<Gate, { ok: true }>['requirement'] }
}

function cleanNote(value: unknown) {
  return String(value ?? '').trim().slice(0, MAX_NOTE)
}

function refresh(id: string) {
  revalidatePath('/portal/requirements')
  revalidatePath(`/portal/requirements/${id}`)
  revalidatePath('/crm/requirements')
  revalidatePath(`/crm/requirements/${id}`)
}

/** Runs the database-guarded transition with the caller's own session (auth.uid() applies). */
async function transition(id: string, to: string, note: string | null, event: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('requirement_transition', {
    p_requirement_id: id,
    p_to_stage: to,
    p_note: note,
    p_note_visible: true,
  })
  if (error) {
    console.error('[portal] requirement transition failed', error.message)
    return { error: friendlyTransitionError(error.message) }
  }
  await notifyRequirementEvent(id, event, note)
  refresh(id)
  return { success: true }
}

function friendlyTransitionError(message: string) {
  // The database raises plain-language messages for expected rule violations.
  if (/cannot move from|add at least one product|add a note|tell us what|not found|not permitted/i.test(message)) return message
  return 'We could not complete that. Please refresh the page and try again.'
}

export async function confirmRequirement(requirementId: string): Promise<ActionResult> {
  const g = await gate(requirementId)
  if (!g.ok) return { error: g.error }
  return transition(requirementId, 'client_confirmed', null, 'client_confirmed')
}

export async function sendBackRequirement(requirementId: string, note: string): Promise<ActionResult> {
  const g = await gate(requirementId)
  if (!g.ok) return { error: g.error }
  const text = cleanNote(note)
  if (!text) return { error: 'Please tell us what needs to change.' }
  return transition(requirementId, 'submitted', text, 'resubmitted')
}

export type ResubmitInput = {
  description: string
  budget_per_unit: string
  quantity: string
  deadline: string
  delivery_city: string
  note: string
}

/** After "changes requested": the client edits the core details and resubmits. */
export async function resubmitRequirement(requirementId: string, input: ResubmitInput): Promise<ActionResult> {
  const g = await gate(requirementId)
  if (!g.ok) return { error: g.error }
  if (!clientCanResubmit(g.requirement.workflow_stage)) return { error: 'This requirement cannot be edited right now.' }

  const description = String(input.description || '').trim()
  if (description.length > 2000) return { error: 'Keep the description under 2,000 characters.' }

  const budget = Number(input.budget_per_unit)
  if (input.budget_per_unit !== '' && (!Number.isFinite(budget) || budget <= 0 || budget > 10_000_000)) {
    return { error: 'Enter a valid budget per unit.' }
  }
  const quantity = Number(input.quantity)
  if (input.quantity !== '' && (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY)) {
    return { error: 'Quantity must be a whole number of at least 1.' }
  }
  const deadline = String(input.deadline || '').trim()
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error: 'Choose a valid required-by date.' }
  const city = String(input.delivery_city || '').trim()
  if (city.length < 2 || city.length > 80) return { error: 'Enter the delivery city.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'This cannot be saved right now. Please contact your account manager.' }
  const { error } = await admin
    .from('requirements')
    .update({
      description: description || null,
      budget: input.budget_per_unit === '' ? null : Math.round(budget * 100) / 100,
      quantity: input.quantity === '' ? null : quantity,
      deadline: deadline || null,
      delivery_city: city,
    })
    .eq('id', requirementId)
    .eq('company_id', g.requirement.company_id)
    .eq('workflow_stage', 'changes_requested')
  if (error) {
    console.error('[portal] resubmit update failed', error.message)
    return { error: 'We could not save your changes. Please try again.' }
  }
  return transition(requirementId, 'submitted', cleanNote(input.note) || null, 'resubmitted')
}

export type SelectionItemInput = { product_id: string; quantity: number | string; notes?: string }

type ValidatedSelection =
  | { error: string }
  | {
      lines: { product_id: string; quantity: number; notes: string | null; unit_price: number; name: string }[]
      total: number
      budgetTotal: number | null
    }

/**
 * Validates a selection against the products this company may see (client_products,
 * which carries the selling price and no supplier data) and totals it from those
 * authorised prices only. Never trusts a price from the browser.
 */
async function validateSelection(
  requirement: { budget: number | null; quantity: number | null },
  rawItems: SelectionItemInput[],
): Promise<ValidatedSelection> {
  const raw = Array.isArray(rawItems) ? rawItems : []
  if (raw.length > MAX_ITEMS) return { error: `A selection can include up to ${MAX_ITEMS} products.` }
  const merged = new Map<string, { quantity: number; notes: string | null }>()
  for (const item of raw) {
    const productId = String(item?.product_id || '')
    const quantity = Number(item?.quantity)
    if (!/^[0-9a-f-]{36}$/i.test(productId)) return { error: 'One of the products is not valid.' }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return { error: 'Each quantity must be a whole number of at least 1.' }
    }
    const existing = merged.get(productId)
    merged.set(productId, {
      quantity: (existing?.quantity || 0) + quantity,
      notes: cleanNote(item?.notes) || existing?.notes || null,
    })
  }

  const supabase = await createClient()
  const ids = Array.from(merged.keys())
  const { data: products } = ids.length
    ? await supabase.from('client_products').select('id, name, price, moq').in('id', ids)
    : { data: [] as { id: string; name: string; price: number; moq: number | null }[] }
  const byId = new Map((products || []).map((p) => [p.id as string, p]))
  const lines: { product_id: string; quantity: number; notes: string | null; unit_price: number; name: string }[] = []
  for (const [productId, entry] of merged) {
    const product = byId.get(productId)
    if (!product) return { error: 'Some products are no longer available in your catalogue. Remove them and try again.' }
    const moq = Number(product.moq) || 0
    if (moq > 1 && entry.quantity < moq) return { error: `${product.name}: the minimum order quantity is ${moq}.` }
    lines.push({ product_id: productId, quantity: entry.quantity, notes: entry.notes, unit_price: Number(product.price), name: product.name as string })
  }
  const { total } = selectionTotals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price })))
  return { lines, total, budgetTotal: totalBudget(requirement.budget, requirement.quantity) }
}

async function persistSelection(
  requirementId: string,
  lines: { product_id: string; quantity: number; notes: string | null; unit_price: number }[],
): Promise<ActionResult> {
  const admin = createAdminClient()
  if (!admin) return { error: 'This cannot be saved right now. Please contact your account manager.' }
  if (lines.length > 0) {
    const { error } = await admin.from('requirement_products').upsert(
      lines.map((l) => ({
        requirement_id: requirementId,
        product_id: l.product_id,
        quantity: l.quantity,
        notes: l.notes,
        unit_price_snapshot: l.unit_price,
      })),
      { onConflict: 'requirement_id,product_id' },
    )
    if (error) {
      console.error('[portal] selection upsert failed', error.message)
      return { error: 'We could not save your selection. Please try again.' }
    }
  }
  // Remove lines the client dropped, only after the new set is safely stored.
  const keep = lines.map((l) => l.product_id)
  const del = admin.from('requirement_products').delete().eq('requirement_id', requirementId)
  const { error: deleteError } = keep.length > 0 ? await del.not('product_id', 'in', `(${keep.join(',')})`) : await del
  if (deleteError) {
    console.error('[portal] selection cleanup failed', deleteError.message)
    return { error: 'We could not finish saving your selection. Please try again.' }
  }
  return { success: true }
}

export async function saveSelection(requirementId: string, items: SelectionItemInput[]): Promise<ActionResult> {
  const g = await gate(requirementId)
  if (!g.ok) return { error: g.error }
  if (!clientCanSelectProducts(g.requirement.workflow_stage)) {
    return { error: 'Product selection opens after you confirm the approved requirement.' }
  }
  const checked = await validateSelection(g.requirement, items)
  if ('error' in checked) return { error: checked.error }
  const saved = await persistSelection(requirementId, checked.lines)
  if ('error' in saved) return saved
  refresh(requirementId)
  return { success: true, message: 'Selection saved.' }
}

export async function submitSelection(
  requirementId: string,
  items: SelectionItemInput[],
  acknowledgeOverBudget: boolean,
): Promise<ActionResult> {
  const g = await gate(requirementId)
  if (!g.ok) return { error: g.error }
  if (!clientCanSelectProducts(g.requirement.workflow_stage)) {
    return { error: 'Product selection opens after you confirm the approved requirement.' }
  }
  const checked = await validateSelection(g.requirement, items)
  if ('error' in checked) return { error: checked.error }
  if (checked.lines.length === 0) return { error: 'Add at least one product before submitting your selection.' }

  const status = budgetStatus(checked.total, checked.budgetTotal)
  let note: string | null = null
  if (status === 'over') {
    if (!acknowledgeOverBudget) {
      return { error: 'Your selection is above the approved budget. Confirm that you want to submit it anyway, or reduce quantities.' }
    }
    const over = checked.total - (checked.budgetTotal || 0)
    note = `Client submitted a selection ₹${over.toLocaleString('en-IN', { maximumFractionDigits: 2 })} above the approved budget.`
  }

  const saved = await persistSelection(requirementId, checked.lines)
  if ('error' in saved) return saved
  const result = await transition(requirementId, 'selection_submitted', note, 'selection_submitted')
  if ('error' in result) return result
  return { success: true, message: 'Selection submitted for review.' }
}
