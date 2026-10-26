'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { writeAudit } from '@/lib/audit'
import { notifyRequirementEvent } from '@/lib/notifications'
import { staffCanCreateQuotation } from '@/lib/requirements/workflow'

export async function createRequirement(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const name = String(formData.get('name') || '').trim()
  const companyId = String(formData.get('company_id') || '')
  if (!name || !companyId) return { error: 'Requirement name and company are required' }

  const quantity = Number(formData.get('quantity') || 1)
  const budget = formData.get('budget') ? Number(formData.get('budget')) : null
  const payload = {
    name,
    company_id: companyId,
    contact_id: String(formData.get('contact_id') || '') || null,
    lead_id: String(formData.get('lead_id') || '') || null,
    owner_id: String(formData.get('owner_id') || '') || user.id,
    quantity: quantity > 0 ? quantity : 1,
    budget,
    revenue_opportunity: budget || 0,
    deadline: String(formData.get('deadline') || '') || null,
    delivery_city: String(formData.get('delivery_city') || '') || null,
    purpose: String(formData.get('purpose') || '') || null,
    payment_terms: String(formData.get('payment_terms') || '') || null,
    description: String(formData.get('description') || '') || null,
    department_name: String(formData.get('department_name') || '') || null,
    status: 'active',
  }

  const { data, error } = await supabase.from('requirements').insert(payload).select('id').single()
  if (error) return { error: error.message }
  await writeAudit(supabase, {
    action: 'create',
    entity: 'requirement',
    entityId: data.id,
    next: payload,
    userId: user.id,
  })
  revalidatePath('/crm/requirements')
  redirect(`/crm/requirements/${data.id}`)
}

export async function createRequirementFromLead(formData: FormData) {
  return createRequirement(formData)
}

export async function createQuotationFromRequirement(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const requirementId = String(formData.get('requirement_id') || '')
  if (!requirementId) return { error: 'Requirement is required' }

  const { data: req } = await supabase
    .from('requirements')
    .select('id, company_id, contact_id, owner_id, quantity, workflow_stage')
    .eq('id', requirementId)
    .single()
  if (!req) return { error: 'Requirement not found' }
  // Client-portal requirements can only be quoted once the product selection is approved.
  if (req.workflow_stage && !staffCanCreateQuotation(req.workflow_stage)) {
    return { error: 'This requirement cannot be quoted until the client has confirmed it and the product selection is approved.' }
  }

  const { data: quoteNumber, error: numError } = await supabase.rpc('next_quotation_number')
  if (numError || !quoteNumber) return { error: numError?.message || 'Could not allocate quote number' }

  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 14)

  const { data: quote, error } = await supabase
    .from('quotations')
    .insert({
      quotation_number: quoteNumber,
      requirement_id: req.id,
      company_id: req.company_id,
      contact_id: req.contact_id,
      owner_id: req.owner_id || user.id,
      status: 'draft',
      valid_until: validUntil.toISOString().slice(0, 10),
      notes: String(formData.get('notes') || '') || null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const { data: reqProducts } = await supabase
    .from('requirement_products')
    .select('product_id, quantity, unit_price_snapshot, product:products(id, name, price)')
    .eq('requirement_id', req.id)

  if (reqProducts && reqProducts.length > 0) {
    const items = reqProducts.map((row) => {
      const product = Array.isArray(row.product) ? row.product[0] : row.product
      const qty = row.quantity || req.quantity || 1
      const unit = Number(row.unit_price_snapshot ?? product?.price ?? 0)
      return {
        quotation_id: quote.id,
        product_id: row.product_id,
        description: product?.name || null,
        quantity: qty,
        unit_price: unit,
        line_total: qty * unit,
      }
    })
    const { error: itemError } = await supabase.from('quotation_items').insert(items)
    if (itemError) return { error: itemError.message }
    await supabase.rpc('recalc_quotation_totals', { p_quotation_id: quote.id })
  }

  await writeAudit(supabase, {
    action: 'create',
    entity: 'quotation',
    entityId: quote.id,
    next: { requirement_id: req.id, quotation_number: quoteNumber },
    userId: user.id,
  })
  revalidatePath('/crm/quotations')
  revalidatePath(`/crm/requirements/${req.id}`)
  redirect(`/crm/quotations/${quote.id}`)
}

export async function addProductToRequirement(formData: FormData) {
  const supabase = await createClient()
  const requirementId = String(formData.get('requirement_id') || '')
  const productId = String(formData.get('product_id') || '')
  const quantity = Number(formData.get('quantity') || 1)
  if (!requirementId || !productId) return { error: 'Requirement and product are required' }

  const { error } = await supabase.from('requirement_products').insert({
    requirement_id: requirementId,
    product_id: productId,
    quantity: quantity > 0 ? quantity : 1,
  })
  if (error) return { error: error.message }
  revalidatePath(`/crm/requirements/${requirementId}`)
  return { success: true }
}

export async function updateRequirement(id: string, data: Record<string, unknown>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { error } = await supabase.from('requirements').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/crm/requirements/${id}`)
  return { success: true }
}

export async function updateRequirementForm(formData: FormData) {
  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Requirement is required' }
  const budget = formData.get('budget') ? Number(formData.get('budget')) : null
  return updateRequirement(id, {
    name: String(formData.get('name') || '').trim(),
    quantity: Number(formData.get('quantity') || 1) || 1,
    budget,
    revenue_opportunity: budget || 0,
    deadline: String(formData.get('deadline') || '') || null,
    delivery_city: String(formData.get('delivery_city') || '') || null,
    purpose: String(formData.get('purpose') || '') || null,
    payment_terms: String(formData.get('payment_terms') || '') || null,
    description: String(formData.get('description') || '') || null,
    status: String(formData.get('status') || 'active'),
  })
}

export async function removeRequirement(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Requirement is required' }

  const [{ count: quotes }, { count: orders }] = await Promise.all([
    supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('requirement_id', id),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('requirement_id', id),
  ])
  if (quotes || orders) {
    const { error } = await supabase.from('requirements').update({ status: 'closed' }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/crm/requirements')
    revalidatePath(`/crm/requirements/${id}`)
    redirect(`/crm/requirements/${id}?removed=archived`)
  }

  const { error } = await supabase.from('requirements').delete().eq('id', id)
  if (error) {
    await supabase.from('requirements').update({ status: 'closed' }).eq('id', id)
    return { error: 'This requirement could not be deleted. It was closed instead.' }
  }
  revalidatePath('/crm/requirements')
  redirect('/crm/requirements')
}

type WorkflowActionResult = { success: true } | { error: string }

const NOTE_MAX = 1000

async function runTransition(requirementId: string, to: string, note: string, event: string, visible = true): Promise<WorkflowActionResult> {
  if (!isUuidLike(requirementId)) return { error: 'Requirement not found.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }
  const { error } = await supabase.rpc('requirement_transition', {
    p_requirement_id: requirementId,
    p_to_stage: to,
    p_note: note.trim().slice(0, NOTE_MAX) || null,
    p_note_visible: visible,
  })
  if (error) {
    console.error('[crm] requirement transition failed', error.message)
    // The database raises plain-language messages for expected rule violations.
    if (/cannot move from|add a note|not found|cannot review|not part of/i.test(error.message)) return { error: error.message }
    return { error: 'We could not record that decision. Please refresh and try again.' }
  }
  await writeAudit(supabase, { action: 'update', entity: 'requirement', entityId: requirementId, next: { workflow_stage: to }, userId: user.id })
  await notifyRequirementEvent(requirementId, event, note.trim() || null)
  revalidatePath('/crm/requirements')
  revalidatePath(`/crm/requirements/${requirementId}`)
  revalidatePath(`/portal/requirements/${requirementId}`)
  return { success: true }
}

function isUuidLike(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

export async function decideRequirement(requirementId: string, decision: 'approve' | 'reject' | 'changes', note: string): Promise<WorkflowActionResult> {
  const text = String(note || '')
  if (decision !== 'approve' && !text.trim()) return { error: 'Add a note explaining the reason.' }
  const map = {
    approve: ['admin_approved', 'admin_approved'],
    reject: ['admin_rejected', 'admin_rejected'],
    changes: ['changes_requested', 'changes_requested'],
  } as const
  const entry = map[decision]
  if (!entry) return { error: 'Choose a decision.' }
  return runTransition(requirementId, entry[0], text, entry[1])
}

export async function decideSelection(requirementId: string, decision: 'approve' | 'changes', note: string): Promise<WorkflowActionResult> {
  const text = String(note || '')
  if (decision === 'changes' && !text.trim()) return { error: 'Add a note explaining what to change.' }
  if (decision === 'approve') return runTransition(requirementId, 'selection_approved', text, 'selection_approved')
  if (decision === 'changes') return runTransition(requirementId, 'selection_changes_requested', text, 'selection_changes_requested')
  return { error: 'Choose a decision.' }
}

export async function addRequirementInternalNote(requirementId: string, note: string): Promise<WorkflowActionResult> {
  if (!isUuidLike(requirementId)) return { error: 'Requirement not found.' }
  const text = String(note || '').trim().slice(0, NOTE_MAX)
  if (!text) return { error: 'Write a note first.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('requirement_add_internal_note', { p_requirement_id: requirementId, p_note: text })
  if (error) {
    console.error('[crm] internal note failed', error.message)
    return { error: 'We could not save the note. Please try again.' }
  }
  revalidatePath(`/crm/requirements/${requirementId}`)
  return { success: true }
}
