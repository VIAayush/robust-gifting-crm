/**
 * Planning for rolling back a bulk price batch. Pure, so the safety rule can be unit-tested:
 * a product is only restored when its current price and MRP still equal what the batch set.
 * If someone changed it again afterwards, rolling back would silently undo that newer edit,
 * so such products are reported as conflicts and left alone.
 */
export type BatchHistoryRow = {
  product_id: string
  old_price: number | null
  new_price: number | null
  old_mrp: number | null
  new_mrp: number | null
}

export type CurrentPricing = { price: number | null; mrp: number | null }

const same = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null ? null : Number(a)) === (b == null ? null : Number(b))

export function planRollback(rows: BatchHistoryRow[], current: Map<string, CurrentPricing>) {
  const revert: { product_id: string; price: number | null; mrp: number | null; from: CurrentPricing }[] = []
  const conflicts: string[] = []
  const missing: string[] = []
  // A product appears once per batch (SKUs are unique in a file); if it ever repeats, the first row wins.
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.product_id)) continue
    seen.add(row.product_id)
    const now = current.get(row.product_id)
    if (!now) {
      missing.push(row.product_id)
      continue
    }
    if (!same(now.price, row.new_price) || !same(now.mrp, row.new_mrp)) {
      conflicts.push(row.product_id)
      continue
    }
    revert.push({ product_id: row.product_id, price: row.old_price, mrp: row.old_mrp, from: now })
  }
  return { revert, conflicts, missing }
}
