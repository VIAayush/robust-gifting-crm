'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { canInvoiceOrder, canRecordPayment, invoiceDueDate, validatePayment } from '@/lib/finance/payment-rules'

/**
 * Records a payment against an invoice. Finance roles only (admin, accounts); the database policy on
 * payments enforces the same, this check stops anyone else before a write is even attempted. The amount,
 * method and date are validated here and the amount can never exceed what is still outstanding.
 */
export async function recordPayment(formData: FormData) {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { error: 'Not authenticated' }
  if (!canRecordPayment(profile.role)) return { error: 'Only finance can record payments.' }

  const invoiceId = String(formData.get('invoice_id') || '')
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return { error: 'Invoice not found.' }

  const supabase = await createClient()
  const { data: invoice } = await supabase.from('invoices').select('amount').eq('id', invoiceId).maybeSingle()
  if (!invoice) return { error: 'Invoice not found.' }
  const { data: existing } = await supabase.from('payments').select('amount').eq('invoice_id', invoiceId)
  const alreadyPaid = (existing || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)

  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const checked = validatePayment(
    {
      amount: formData.get('amount'),
      method: formData.get('method'),
      payment_date: formData.get('payment_date'),
      reference: formData.get('reference'),
      notes: formData.get('notes'),
    },
    { amount: Number(invoice.amount), alreadyPaid },
    today,
  )
  if ('error' in checked) return checked

  const { error } = await supabase.from('payments').insert({ invoice_id: invoiceId, ...checked.value, created_by: profile.id })
  if (error) {
    console.error('[invoices] record payment failed', error.message)
    return { error: 'We could not record the payment. Please try again.' }
  }
  // The payments trigger already refreshes the status; this call keeps it correct if the trigger is ever absent.
  await supabase.rpc('refresh_invoice_status', { p_invoice_id: invoiceId })
  await writeAudit(supabase, { action: 'record_payment', entity: 'payments', entityId: invoiceId, next: { amount: checked.value.amount, method: checked.value.method }, userId: profile.id })
  revalidatePath(`/crm/invoices/${invoiceId}`)
  revalidatePath('/crm/invoices')
  revalidatePath('/crm/payments')
  revalidatePath('/crm/receivables')
  return { success: true }
}

/**
 * Creates the invoice for an order (SOW 5.1: "the invoice and payment are recorded in the CRM").
 * Finance only, one invoice per order, amount taken from the order value on the server.
 */
export async function createInvoiceFromOrder(orderId: string, dueDateInput?: string): Promise<{ success: true; invoiceId: string } | { error: string }> {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { error: 'Not authenticated' }
  if (!canRecordPayment(profile.role)) return { error: 'Only finance can create invoices.' }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { error: 'Order not found.' }

  const supabase = await createClient()
  const { data: order } = await supabase.from('orders').select('id, order_number, company_id, status, order_value').eq('id', orderId).maybeSingle()
  if (!order) return { error: 'Order not found.' }
  const { data: existing } = await supabase.from('invoices').select('id').eq('order_id', orderId).limit(1)
  const allowed = canInvoiceOrder({ status: order.status as string, order_value: order.order_value == null ? null : Number(order.order_value) }, Boolean(existing && existing.length > 0))
  if (!allowed.ok) return { error: allowed.error }

  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const due = invoiceDueDate(dueDateInput, today)
  if (!due.ok) return { error: due.error }

  const { data: invoiceNumber, error: numberError } = await supabase.rpc('next_invoice_number')
  if (numberError || !invoiceNumber) return { error: 'Could not allocate an invoice number. Please try again.' }
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      order_id: order.id,
      company_id: order.company_id,
      invoice_date: today,
      due_date: due.due,
      amount: Number(order.order_value),
      status: 'unpaid',
      notes: `Invoice for order ${order.order_number}.`,
    })
    .select('id')
    .single()
  if (error || !invoice) {
    console.error('[invoices] create from order failed', error?.message)
    return { error: 'We could not create the invoice. Please try again.' }
  }
  await writeAudit(supabase, { action: 'create', entity: 'invoices', entityId: invoice.id as string, next: { order_id: order.id, amount: Number(order.order_value) }, userId: profile.id })
  revalidatePath('/crm/invoices')
  revalidatePath('/crm/receivables')
  return { success: true, invoiceId: invoice.id as string }
}
