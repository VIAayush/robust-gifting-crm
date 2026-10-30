/**
 * Item-by-item quotation acceptance. Pure, so the rules (and the totals shown to the client before they
 * submit) are unit-tested. The total mirrors recalc_quotation_totals / quotation_accepted_total in SQL:
 * header discount % and tax % applied to the accepted lines' quantity x unit price.
 */
export type QuoteItem = { id: string; quantity: number; unitPrice: number }
export type ItemDecision = { itemId: string; accept: boolean }

const round2 = (n: number) => Math.round(n * 100) / 100

export function acceptedTotals(items: QuoteItem[], accepted: Set<string>, discountPercent: number, taxPercent: number) {
  let paise = 0
  for (const item of items) {
    if (accepted.has(item.id)) paise += Math.round(item.unitPrice * 100) * item.quantity
  }
  const subtotal = paise / 100
  const discount = round2((subtotal * discountPercent) / 100)
  const tax = round2(((subtotal - discount) * taxPercent) / 100)
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) }
}

/** Every quotation line must be decided exactly once, and only lines of this quotation may appear. */
export function validateDecisions(itemIds: string[], decisions: ItemDecision[]): { ok: true } | { ok: false; error: string } {
  if (itemIds.length === 0) return { ok: false, error: 'This quotation has no items.' }
  if (!Array.isArray(decisions) || decisions.length !== itemIds.length) return { ok: false, error: 'Please accept or reject every item.' }
  const allowed = new Set(itemIds)
  const seen = new Set<string>()
  for (const decision of decisions) {
    if (!decision || typeof decision.itemId !== 'string' || typeof decision.accept !== 'boolean') return { ok: false, error: 'Please accept or reject every item.' }
    if (!allowed.has(decision.itemId)) return { ok: false, error: 'One of the items does not belong to this quotation.' }
    if (seen.has(decision.itemId)) return { ok: false, error: 'Please accept or reject every item exactly once.' }
    seen.add(decision.itemId)
  }
  return { ok: true }
}

export function overallOutcome(decisions: ItemDecision[]): 'accepted' | 'partial' | 'rejected' {
  const accepted = decisions.filter((d) => d.accept).length
  if (accepted === 0) return 'rejected'
  return accepted === decisions.length ? 'accepted' : 'partial'
}

/**
 * When the client rejected some lines, the quotation header keeps showing the full quoted total while the order
 * is only made for the accepted lines. This gives the accepted-only figure to show next to it, or null when
 * nothing was rejected (so the header total is already the whole story).
 */
export function decisionSummary(
  items: { id: string; quantity: number | string; unit_price: number | string; client_decision?: string | null }[],
  discountPercent: number | string | null | undefined,
  taxPercent: number | string | null | undefined,
): { acceptedCount: number; itemCount: number; acceptedTotal: number } | null {
  if (!items.some((i) => i.client_decision === 'rejected')) return null
  const accepted = new Set(items.filter((i) => i.client_decision === 'accepted').map((i) => i.id))
  const totals = acceptedTotals(
    items.map((i) => ({ id: i.id, quantity: Number(i.quantity), unitPrice: Number(i.unit_price) })),
    accepted,
    Number(discountPercent || 0),
    Number(taxPercent || 0),
  )
  return { acceptedCount: accepted.size, itemCount: items.length, acceptedTotal: totals.total }
}
