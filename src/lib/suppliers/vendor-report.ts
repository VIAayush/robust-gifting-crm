/**
 * Orders and Cost by Vendor: pure row building, totals and CSV. A line with no recorded vendor cost shows
 * "Not set" and is excluded from cost and margin totals; costs are never estimated or invented.
 */

export type VendorLineInput = {
  orderNumber: string
  orderDate: string
  orderStatus: string
  company: string | null
  vendor: string | null
  sku: string | null
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  /** Per-unit cost snapshotted when the supplier was assigned to the order line. */
  supplierCostSnapshot: number | null
}

export type VendorLine = VendorLineInput & {
  vendorLabel: string
  vendorCostTotal: number | null
  margin: number | null
  marginPercent: number | null
}

export type VendorTotals = {
  vendor: string
  lines: number
  selling: number
  /** Selling value of the lines that have a cost; margin is only meaningful for these. */
  sellingWithCost: number
  vendorCost: number
  margin: number
  linesWithoutCost: number
}

export const NOT_SET = 'Not set'
export const UNASSIGNED = 'Unassigned'

const round2 = (n: number) => Math.round(n * 100) / 100

export function buildVendorLines(inputs: VendorLineInput[]): VendorLine[] {
  return inputs.map((input) => {
    const hasCost = input.supplierCostSnapshot !== null && Number.isFinite(input.supplierCostSnapshot)
    const vendorCostTotal = hasCost ? round2((input.supplierCostSnapshot as number) * input.quantity) : null
    const margin = vendorCostTotal === null ? null : round2(input.lineTotal - vendorCostTotal)
    const marginPercent = margin === null || !(input.lineTotal > 0) ? null : round2((margin / input.lineTotal) * 100)
    return { ...input, vendorLabel: input.vendor?.trim() || UNASSIGNED, vendorCostTotal, margin, marginPercent }
  })
}

export function totalsByVendor(lines: VendorLine[]): VendorTotals[] {
  const map = new Map<string, VendorTotals>()
  for (const line of lines) {
    const entry = map.get(line.vendorLabel) || { vendor: line.vendorLabel, lines: 0, selling: 0, sellingWithCost: 0, vendorCost: 0, margin: 0, linesWithoutCost: 0 }
    entry.lines += 1
    entry.selling = round2(entry.selling + line.lineTotal)
    if (line.vendorCostTotal === null) entry.linesWithoutCost += 1
    else {
      entry.sellingWithCost = round2(entry.sellingWithCost + line.lineTotal)
      entry.vendorCost = round2(entry.vendorCost + line.vendorCostTotal)
      entry.margin = round2(entry.margin + (line.margin as number))
    }
    map.set(line.vendorLabel, entry)
  }
  return [...map.values()].sort((a, b) => a.vendor.localeCompare(b.vendor))
}

/** Spreadsheet formula injection guard: a text cell starting with = + - @ is prefixed so Excel shows it as text. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function vendorLinesToCsv(lines: VendorLine[]): string {
  const header = ['Vendor', 'Order', 'Order date', 'Status', 'Company', 'SKU', 'Item', 'Quantity', 'Selling price (unit)', 'Selling total', 'Vendor cost (total)', 'Margin', 'Margin %']
  const rows = lines.map((line) => [
    line.vendorLabel,
    line.orderNumber,
    line.orderDate.slice(0, 10),
    line.orderStatus,
    line.company ?? '',
    line.sku ?? '',
    line.description,
    line.quantity,
    line.unitPrice,
    line.lineTotal,
    line.vendorCostTotal ?? NOT_SET,
    line.margin ?? NOT_SET,
    line.marginPercent ?? NOT_SET,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** YYYY-MM-DD or null. */
export function parseDateParam(value: string | null | undefined): string | null {
  const v = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}
