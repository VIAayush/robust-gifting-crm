/** Receivable figures that account for partial payments. An invoice's open balance is its amount less what was paid. */

type Money = number | string | null | undefined
export type ReceivableInvoice = { id: string; amount: Money; due_date: string | null }
export type ReceivablePayment = { invoice_id: string; amount: Money; payment_date: string }

const round2 = (n: number) => Math.round(n * 100) / 100

export function paidByInvoice(payments: ReceivablePayment[]): Map<string, number> {
  const paid = new Map<string, number>()
  for (const p of payments) paid.set(p.invoice_id, round2((paid.get(p.invoice_id) || 0) + Number(p.amount || 0)))
  return paid
}

export function invoiceBalance(invoice: ReceivableInvoice, paid: Map<string, number>): number {
  return Math.max(0, round2(Number(invoice.amount || 0) - (paid.get(invoice.id) || 0)))
}

function monthEnd(today: string) {
  const [y, m] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/**
 * today is a YYYY-MM-DD date in the business time zone. An invoice due today is not overdue yet.
 * paidThisMonth is cash actually received (payments dated this month), whether or not the invoice is fully paid.
 */
export function summarizeReceivables(invoices: ReceivableInvoice[], payments: ReceivablePayment[], today: string) {
  const paid = paidByInvoice(payments)
  const end = monthEnd(today)
  let outstanding = 0
  let overdue = 0
  let dueThisMonth = 0
  for (const inv of invoices) {
    const balance = invoiceBalance(inv, paid)
    if (balance <= 0) continue
    outstanding += balance
    if (inv.due_date && inv.due_date < today) overdue += balance
    else if (inv.due_date && inv.due_date <= end) dueThisMonth += balance
  }
  const month = today.slice(0, 7)
  const paidThisMonth = payments.filter((p) => p.payment_date.startsWith(month)).reduce((sum, p) => sum + Number(p.amount || 0), 0)
  return { outstanding: round2(outstanding), overdue: round2(overdue), dueThisMonth: round2(dueThisMonth), paidThisMonth: round2(paidThisMonth) }
}

/** Today's date in India (the app's business time zone). */
export function businessToday(now = Date.now()): string {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
