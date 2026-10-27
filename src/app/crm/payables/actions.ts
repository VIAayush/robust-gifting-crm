'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { applyPayablePayment, validatePayable } from '@/lib/finance/payable-rules'

type Result = { success: true } | { error: string }

/** Finance only (admin, accounts). The payables policy in the database enforces the same. */
async function financeEditor() {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { ok: false, error: 'Your session has expired. Please sign in again.' } as const
  if (profile.role !== 'admin' && profile.role !== 'accounts') return { ok: false, error: 'Only finance can change payables.' } as const
  return { ok: true, profile, supabase: await createClient() } as const
}

export async function createPayable(formData: FormData): Promise<Result> {
  const ctx = await financeEditor()
  if (!ctx.ok) return { error: ctx.error }
  const checked = validatePayable({
    vendor_type: formData.get('vendor_type'),
    vendor_name: formData.get('vendor_name'),
    amount: formData.get('amount'),
    due_date: formData.get('due_date'),
    notes: formData.get('notes'),
  })
  if ('error' in checked) return checked

  // Optional link to an order by its number; an unknown number is an error, never silently ignored.
  let orderId: string | null = null
  const orderNumber = String(formData.get('order_number') || '').trim()
  if (orderNumber) {
    const { data: order } = await ctx.supabase.from('orders').select('id').eq('order_number', orderNumber).maybeSingle()
    if (!order) return { error: `No order with number ${orderNumber}.` }
    orderId = order.id as string
  }

  const { data, error } = await ctx.supabase
    .from('payables')
    .insert({ ...checked.value, order_id: orderId, status: 'unpaid', amount_paid: 0, created_by: ctx.profile.id })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[payables] create failed', error?.message)
    return { error: 'We could not save the payable. Please try again.' }
  }
  await writeAudit(ctx.supabase, { action: 'create', entity: 'payables', entityId: data.id as string, next: { vendor_name: checked.value.vendor_name, amount: checked.value.amount }, userId: ctx.profile.id })
  revalidatePath('/crm/payables')
  return { success: true }
}

export async function recordPayablePayment(formData: FormData): Promise<Result> {
  const ctx = await financeEditor()
  if (!ctx.ok) return { error: ctx.error }
  const id = String(formData.get('id') || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Payable not found.' }

  const { data: payable } = await ctx.supabase.from('payables').select('id, amount, amount_paid').eq('id', id).maybeSingle()
  if (!payable) return { error: 'Payable not found.' }
  const applied = applyPayablePayment({ amount: Number(payable.amount), amount_paid: Number(payable.amount_paid) }, formData.get('payment'))
  if ('error' in applied) return applied

  // The previous paid amount is part of the condition, so two simultaneous payments cannot both succeed on stale data.
  const { data: updated, error } = await ctx.supabase
    .from('payables')
    .update({ amount_paid: applied.amountPaid, status: applied.status })
    .eq('id', id)
    .eq('amount_paid', payable.amount_paid)
    .select('id')
    .maybeSingle()
  if (error || !updated) return { error: 'This payable changed while you were saving. Please refresh and try again.' }
  await writeAudit(ctx.supabase, { action: 'record_payable_payment', entity: 'payables', entityId: id, next: { amount_paid: applied.amountPaid, status: applied.status }, userId: ctx.profile.id })
  revalidatePath('/crm/payables')
  return { success: true }
}
