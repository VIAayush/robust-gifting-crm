/**
 * Planning for bulk supplier assignment (CSV or pasted SKU list). Pure: it takes the rows plus a snapshot of
 * existing products, suppliers and mappings and returns exactly what would change. The same planner produces
 * the dry-run preview and the real apply, so what you preview is what is written.
 *
 * Only product_suppliers mappings are ever planned. Product rows (name, SKU, price, images, ...) are never
 * touched, so the existing catalogue cannot be altered or duplicated by this tool.
 */

export type BulkRow = {
  row: number
  sku: string
  supplier: string
  supplier_cost: string
  supplier_sku: string
  lead_time_days: string
  moq: string
  preferred: string
}

export type ExistingMapping = {
  id: string
  product_id: string
  supplier_id: string
  supplier_cost: number | null
  supplier_sku: string | null
  lead_time_days: number | null
  moq: number | null
  is_preferred: boolean
  status: string
}

export type PlanContext = {
  /** upper-case SKU -> product id */
  productBySku: Map<string, string>
  /** lower-case supplier name -> supplier id */
  supplierByName: Map<string, string>
  /** active + inactive mappings with no variant, grouped by product id */
  mappingsByProduct: Map<string, ExistingMapping[]>
}

export type PlannedRow =
  | { row: number; sku: string; supplier: string; status: 'error'; error: string }
  | {
      row: number
      sku: string
      supplier: string
      status: 'create' | 'update' | 'unchanged'
      productId: string
      /** null when the supplier does not exist yet and will be created */
      supplierId: string | null
      createSupplier: boolean
      mappingId: string | null
      cost: number | null
      costChanged: boolean
      oldCost: number | null
      supplierSku: string | null
      leadTimeDays: number | null
      moq: number | null
      preferred: boolean
    }

export type Plan = {
  rows: PlannedRow[]
  suppliersToCreate: string[]
  /** replace mode: existing active mappings (not in the file) that would be switched off */
  deactivate: { mappingId: string; productId: string; sku: string }[]
  counts: { create: number; update: number; unchanged: number; error: number; deactivate: number; suppliersToCreate: number }
}

export type PlanOptions = { mode: 'add' | 'replace'; createMissingSuppliers: boolean }

const TRUE_VALUES = new Set(['yes', 'y', 'true', '1', 'preferred'])

function parseOptionalNumber(raw: string, integer: boolean): { value: number | null; blank: boolean; invalid: boolean } {
  const cleaned = raw.replace(/[₹,\s]/g, '')
  if (!cleaned) return { value: null, blank: true, invalid: false }
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) return { value: null, blank: false, invalid: true }
  return { value: integer ? n : Math.round(n * 100) / 100, blank: false, invalid: false }
}

const sameNumber = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null ? null : Number(a)) === (b == null ? null : Number(b))

export function planBulkAssignment(rows: BulkRow[], context: PlanContext, options: PlanOptions): Plan {
  const planned: PlannedRow[] = []
  const seenPairs = new Set<string>()
  const preferredByProduct = new Set<string>()
  const newSuppliers = new Map<string, string>() // lower -> display name
  const touchedProducts = new Map<string, { sku: string; supplierIds: Set<string>; newNames: Set<string> }>()

  for (const input of rows) {
    const sku = input.sku.trim().toUpperCase()
    const supplierName = input.supplier.trim()
    const base = { row: input.row, sku, supplier: supplierName }
    const fail = (error: string): PlannedRow => ({ ...base, status: 'error', error })

    if (!sku) { planned.push(fail('Missing SKU')); continue }
    if (!supplierName) { planned.push(fail('Missing supplier')); continue }
    if (supplierName.length > 120) { planned.push(fail('Supplier name is too long')); continue }

    const productId = context.productBySku.get(sku)
    if (!productId) {
      planned.push(fail('SKU not found. This tool only maps suppliers to existing products; add new products with Import catalogue CSV first.'))
      continue
    }

    const key = `${sku}|${supplierName.toLowerCase()}`
    if (seenPairs.has(key)) { planned.push(fail('Duplicate SKU and supplier in this file')); continue }
    seenPairs.add(key)

    const cost = parseOptionalNumber(input.supplier_cost, false)
    if (cost.invalid) { planned.push(fail('Supplier cost must be zero or a positive number')); continue }
    const lead = parseOptionalNumber(input.lead_time_days, true)
    if (lead.invalid) { planned.push(fail('Lead time must be a whole number of days')); continue }
    const moq = parseOptionalNumber(input.moq, true)
    if (moq.invalid) { planned.push(fail('MOQ must be a whole number')); continue }

    const wantsPreferred = TRUE_VALUES.has(input.preferred.trim().toLowerCase())
    if (wantsPreferred && preferredByProduct.has(productId)) { planned.push(fail('Only one preferred supplier per product')); continue }

    const supplierId = context.supplierByName.get(supplierName.toLowerCase()) ?? null
    let createSupplier = false
    if (!supplierId) {
      if (!options.createMissingSuppliers) {
        planned.push(fail(`Supplier "${supplierName}" does not exist. Tick "create missing suppliers" or add it first.`))
        continue
      }
      createSupplier = true
      if (!newSuppliers.has(supplierName.toLowerCase())) newSuppliers.set(supplierName.toLowerCase(), supplierName)
    }
    if (wantsPreferred) preferredByProduct.add(productId)

    const touched = touchedProducts.get(productId) || { sku, supplierIds: new Set<string>(), newNames: new Set<string>() }
    if (supplierId) touched.supplierIds.add(supplierId)
    else touched.newNames.add(supplierName.toLowerCase())
    touchedProducts.set(productId, touched)

    const existing = supplierId ? (context.mappingsByProduct.get(productId) || []).find((m) => m.supplier_id === supplierId) : undefined
    if (!existing) {
      planned.push({
        ...base, status: 'create', productId, supplierId, createSupplier, mappingId: null,
        cost: cost.value, costChanged: false, oldCost: null,
        supplierSku: input.supplier_sku.trim() || null, leadTimeDays: lead.value, moq: moq.value, preferred: wantsPreferred,
      })
      continue
    }

    // Blank cells mean "leave as is" on an existing mapping, never "clear".
    const nextCost = cost.blank ? existing.supplier_cost : cost.value
    const nextSku = input.supplier_sku.trim() ? input.supplier_sku.trim() : existing.supplier_sku
    const nextLead = lead.blank ? existing.lead_time_days : lead.value
    const nextMoq = moq.blank ? existing.moq : moq.value
    const nextPreferred = wantsPreferred || existing.is_preferred
    const reactivates = existing.status !== 'active'
    const changed =
      reactivates || !sameNumber(nextCost, existing.supplier_cost) || nextSku !== existing.supplier_sku ||
      !sameNumber(nextLead, existing.lead_time_days) || !sameNumber(nextMoq, existing.moq) || nextPreferred !== existing.is_preferred
    planned.push({
      ...base, status: changed ? 'update' : 'unchanged', productId, supplierId, createSupplier: false, mappingId: existing.id,
      cost: nextCost, costChanged: !sameNumber(nextCost, existing.supplier_cost), oldCost: existing.supplier_cost,
      supplierSku: nextSku, leadTimeDays: nextLead, moq: nextMoq, preferred: nextPreferred,
    })
  }

  const deactivate: Plan['deactivate'] = []
  if (options.mode === 'replace') {
    for (const [productId, touched] of touchedProducts) {
      // A product whose only listed rows failed validation must not lose its current suppliers.
      const hasValidRow = planned.some((p) => p.status !== 'error' && p.productId === productId)
      if (!hasValidRow) continue
      for (const mapping of context.mappingsByProduct.get(productId) || []) {
        if (mapping.status === 'active' && !touched.supplierIds.has(mapping.supplier_id)) {
          deactivate.push({ mappingId: mapping.id, productId, sku: touched.sku })
        }
      }
    }
  }

  const count = (status: PlannedRow['status']) => planned.filter((p) => p.status === status).length
  return {
    rows: planned,
    suppliersToCreate: [...newSuppliers.values()],
    deactivate,
    counts: {
      create: count('create'),
      update: count('update'),
      unchanged: count('unchanged'),
      error: count('error'),
      deactivate: deactivate.length,
      suppliersToCreate: newSuppliers.size,
    },
  }
}

/** Builds rows from a pasted SKU list (one per line, comma/space separated also accepted) for one chosen supplier. */
export function rowsFromSkuList(text: string, supplier: string, cost: string, preferred: boolean): BulkRow[] {
  const skus = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return skus.map((sku, index) => ({
    row: index + 1,
    sku,
    supplier,
    supplier_cost: cost,
    supplier_sku: '',
    lead_time_days: '',
    moq: '',
    preferred: preferred ? 'yes' : '',
  }))
}
