/** Rules for accounts payable (money owed to vendors). Pure, so they are unit-tested. */

export const VENDOR_TYPES = ['supplier', 'printing', 'courier', 'sample', 'other'] as const
export type VendorType = (typeof VENDOR_TYPES)[number]
export type PayableStatus = 'unpaid' | 'partial' | 'paid'

const round2 = (n: number) => Math.round(n * 100) / 100

export function validatePayable(input: { vendor_type: unknown; vendor_name: unknown; amount: unknown; due_date: unknown; notes: unknown }):
  | { value: { vendor_type: VendorType; vendor_name: string; amount: number; due_date: string | null; notes: string | null } }
  | { error: string } {
  const type = String(input.vendor_type ?? '')
  if (!(VENDOR_TYPES as readonly string[]).includes(type)) return { error: 'Choose the vendor type.' }
  const name = String(input.vendor_name ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return { error: 'Enter the vendor name.' }
  if (name.length > 120) return { error: 'Keep the vendor name under 120 characters.' }
  const amount = round2(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter an amount greater than zero.' }
  if (amount > 1_000_000_000) return { error: 'That amount looks too large. Please check it.' }
  const due = String(input.due_date ?? '').trim()
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)))) return { error: 'Enter a valid due date.' }
  const notes = String(input.notes ?? '').trim()
  if (notes.length > 1000) return { error: 'Keep the notes under 1,000 characters.' }
  return { value: { vendor_type: type as VendorType, vendor_name: name, amount, due_date: due || null, notes: notes || null } }
}

/** A payment against a payable: positive, and never more than what is still owed. */
export function applyPayablePayment(payable: { amount: number; amount_paid: number }, payment: unknown):
  | { amountPaid: number; status: PayableStatus }
  | { error: string } {
  const pay = round2(Number(payment))
  if (!Number.isFinite(pay) || pay <= 0) return { error: 'Enter a payment amount greater than zero.' }
  const outstanding = round2(Number(payable.amount) - Number(payable.amount_paid))
  if (outstanding <= 0) return { error: 'This payable is already fully paid.' }
  if (pay > outstanding) return { error: `The payment is more than the amount outstanding (${outstanding.toFixed(2)}).` }
  const amountPaid = round2(Number(payable.amount_paid) + pay)
  return { amountPaid, status: amountPaid >= round2(Number(payable.amount)) ? 'paid' : 'partial' }
}
