/** Validation for manually recorded invoice payments. Pure, so it is unit-tested. */

export const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'upi', 'card', 'cash', 'other'] as const
export const MAX_PAYMENT = 100_000_000

export type PaymentInput = { amount: unknown; method: unknown; payment_date: unknown; reference: unknown; notes: unknown }
export type PaymentValue = { amount: number; method: (typeof PAYMENT_METHODS)[number]; payment_date: string; reference: string | null; notes: string | null }

export function validatePayment(
  input: PaymentInput,
  invoice: { amount: number; alreadyPaid: number },
  today: string,
): { value: PaymentValue } | { error: string } {
  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter a payment amount greater than zero.' }
  if (amount > MAX_PAYMENT) return { error: 'That amount looks too large. Please check it.' }
  const outstanding = Math.round((invoice.amount - invoice.alreadyPaid) * 100) / 100
  if (outstanding <= 0) return { error: 'This invoice is already fully paid.' }
  if (amount > outstanding) return { error: `The payment is more than the amount outstanding (${outstanding.toFixed(2)}).` }

  const method = String(input.method ?? '')
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return { error: 'Choose a valid payment method.' }

  const date = String(input.payment_date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Enter a valid payment date.' }
  if (date > today) return { error: 'The payment date cannot be in the future.' }

  const reference = String(input.reference ?? '').trim()
  const notes = String(input.notes ?? '').trim()
  if (reference.length > 120) return { error: 'Keep the reference under 120 characters.' }
  if (notes.length > 1000) return { error: 'Keep the notes under 1,000 characters.' }

  return { value: { amount, method: method as PaymentValue['method'], payment_date: date, reference: reference || null, notes: notes || null } }
}

/** Only finance roles record payments. */
export function canRecordPayment(role: string | null | undefined) {
  return role === 'admin' || role === 'accounts'
}

/** An order can be invoiced once: it must have a value, must not be cancelled, and must not already have an invoice. */
export function canInvoiceOrder(order: { status: string; order_value: number | null }, alreadyInvoiced: boolean): { ok: true } | { ok: false; error: string } {
  if (alreadyInvoiced) return { ok: false, error: 'This order already has an invoice.' }
  if (order.status === 'cancelled') return { ok: false, error: 'A cancelled order cannot be invoiced.' }
  if (!(Number(order.order_value) > 0)) return { ok: false, error: 'This order has no value to invoice.' }
  return { ok: true }
}

/** Due date: an explicit valid date on/after the invoice date, otherwise invoice date + the default terms. */
export function invoiceDueDate(requested: string | null | undefined, invoiceDate: string, defaultDays = 30): { ok: true; due: string } | { ok: false; error: string } {
  const value = String(requested ?? '').trim()
  if (!value) {
    const d = new Date(`${invoiceDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + defaultDays)
    return { ok: true, due: d.toISOString().slice(0, 10) }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return { ok: false, error: 'Enter a valid due date.' }
  if (value < invoiceDate) return { ok: false, error: 'The due date cannot be before the invoice date.' }
  return { ok: true, due: value }
}
