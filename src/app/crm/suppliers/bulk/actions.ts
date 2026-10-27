'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/permissions'
import { writeAudit } from '@/lib/audit'
import { parseCsv, normalizeHeader } from '@/lib/csv'
import {
  planBulkAssignment,
  rowsFromSkuList,
  type BulkRow,
  type ExistingMapping,
  type Plan,
  type PlannedRow,
} from '@/lib/suppliers/bulk-assign'

const MAX_ROWS = 5000
const CHUNK = 400

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export type BulkPreview = {
  plan: Plan
  rows: PlannedRow[]
  truncated: boolean
}

const COLUMN_ALIASES: Record<keyof Omit<BulkRow, 'row'>, string[]> = {
  sku: ['sku', 'product_code', 'code', 'item_code'],
  supplier: ['supplier', 'supplier_name', 'vendor', 'vendor_name'],
  supplier_cost: ['supplier_cost', 'vendor_cost', 'cost', 'landed_cost'],
  supplier_sku: ['supplier_sku', 'vendor_sku', 'vendor_code'],
  lead_time_days: ['lead_time_days', 'lead_time', 'lead_days'],
  moq: ['moq', 'min_qty', 'supplier_moq'],
  preferred: ['preferred', 'is_preferred', 'primary'],
}

function rowsFromCsv(text: string): { rows: BulkRow[] } | { error: string } {
  const table = parseCsv(text)
  if (table.headers.length === 0) return { error: 'The CSV file is empty.' }
  const keys = table.headers.map(normalizeHeader)
  const index = (field: keyof typeof COLUMN_ALIASES) => keys.findIndex((k) => COLUMN_ALIASES[field].includes(k))
  const skuIdx = index('sku')
  const supplierIdx = index('supplier')
  if (skuIdx === -1) return { error: 'The CSV needs a "sku" column.' }
  if (supplierIdx === -1) return { error: 'The CSV needs a "supplier" column.' }
  if (table.rows.length > MAX_ROWS) return { error: `Please upload at most ${MAX_ROWS} rows at a time.` }
  const idx = {
    supplier_cost: index('supplier_cost'),
    supplier_sku: index('supplier_sku'),
    lead_time_days: index('lead_time_days'),
    moq: index('moq'),
    preferred: index('preferred'),
  }
  const cell = (cells: string[], i: number) => (i === -1 ? '' : (cells[i] || '').trim())
  return {
    rows: table.rows
      .filter((cells) => cells.some((c) => c.trim()))
      .map((cells, n) => ({
        row: n + 2,
        sku: cell(cells, skuIdx),
        supplier: cell(cells, supplierIdx),
        supplier_cost: cell(cells, idx.supplier_cost),
        supplier_sku: cell(cells, idx.supplier_sku),
        lead_time_days: cell(cells, idx.lead_time_days),
        moq: cell(cells, idx.moq),
        preferred: cell(cells, idx.preferred),
      })),
  }
}

async function authorise(supabase: SupabaseServer, needsSupplierCreate: boolean) {
  // Costs are shown and changed here, so the cost permission is required as well as the mapping permission.
  const manage = await requirePermission(supabase, 'products.supplier_manage')
  if ('error' in manage) return manage
  const cost = await requirePermission(supabase, 'suppliers.cost_view')
  if ('error' in cost) return { error: 'Bulk supplier assignment needs permission to view supplier costs.' }
  if (needsSupplierCreate) {
    const create = await requirePermission(supabase, 'suppliers.create')
    if ('error' in create) return { error: 'You do not have permission to create suppliers. Untick "create missing suppliers".' }
  }
  return manage
}

async function buildPlan(supabase: SupabaseServer, formData: FormData): Promise<{ plan: Plan } | { error: string }> {
  const source = String(formData.get('source') || 'csv')
  const options = {
    mode: String(formData.get('assign_mode') || 'add') === 'replace' ? ('replace' as const) : ('add' as const),
    createMissingSuppliers: String(formData.get('create_missing') || '') === '1',
  }

  let rows: BulkRow[]
  if (source === 'skus') {
    const supplier = String(formData.get('supplier') || '').trim()
    if (!supplier) return { error: 'Choose or type a supplier.' }
    const list = String(formData.get('sku_list') || '')
    if (list.length > 200_000) return { error: 'The SKU list is too long.' }
    const costRaw = String(formData.get('supplier_cost') || '').trim()
    rows = rowsFromSkuList(list, supplier, costRaw, String(formData.get('preferred') || '') === '1')
    if (rows.length === 0) return { error: 'Paste at least one SKU.' }
    if (rows.length > MAX_ROWS) return { error: `Please use at most ${MAX_ROWS} SKUs at a time.` }
  } else {
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a CSV file.' }
    if (file.size > 2 * 1024 * 1024) return { error: 'Please keep the CSV under 2 MB.' }
    const parsed = rowsFromCsv(await file.text())
    if ('error' in parsed) return parsed
    rows = parsed.rows
    if (rows.length === 0) return { error: 'The CSV has no data rows.' }
  }

  const skus = Array.from(new Set(rows.map((r) => r.sku.trim().toUpperCase()).filter(Boolean)))
  const productBySku = new Map<string, string>()
  for (let i = 0; i < skus.length; i += CHUNK) {
    const { data, error } = await supabase.from('products').select('id, sku').in('sku', skus.slice(i, i + CHUNK))
    if (error) return { error: 'Could not look up products. Nothing was changed.' }
    for (const p of data || []) productBySku.set(String(p.sku).toUpperCase(), p.id as string)
  }

  const { data: suppliers, error: supplierError } = await supabase.from('suppliers').select('id, name')
  if (supplierError) return { error: 'Could not load suppliers. Nothing was changed.' }
  const supplierByName = new Map((suppliers || []).map((s) => [String(s.name).trim().toLowerCase(), s.id as string]))

  const productIds = Array.from(new Set(productBySku.values()))
  const mappingsByProduct = new Map<string, ExistingMapping[]>()
  for (let i = 0; i < productIds.length; i += CHUNK) {
    // Existing costs are read with the service role: authorise() above already required products.supplier_manage AND
    // suppliers.cost_view, and the ordinary API role cannot read supplier_cost after migration 20261037.
    const { data, error } = await (createAdminClient() ?? supabase)
      .from('product_suppliers')
      .select('id, product_id, supplier_id, supplier_cost, supplier_sku, lead_time_days, moq, is_preferred, status')
      .in('product_id', productIds.slice(i, i + CHUNK))
      .is('variant_id', null)
    if (error) return { error: 'Could not load existing supplier mappings. Nothing was changed.' }
    for (const m of (data || []) as ExistingMapping[]) {
      const list = mappingsByProduct.get(m.product_id) || []
      list.push(m)
      mappingsByProduct.set(m.product_id, list)
    }
  }

  return { plan: planBulkAssignment(rows, { productBySku, supplierByName, mappingsByProduct }, options) }
}

/** Dry run: shows exactly what an apply would do. Writes nothing. */
export async function previewSupplierAssignment(formData: FormData): Promise<BulkPreview | { error: string }> {
  const supabase = await createClient()
  const access = await authorise(supabase, false)
  if ('error' in access) return access
  const built = await buildPlan(supabase, formData)
  if ('error' in built) return built
  const LIMIT = 500
  return { plan: built.plan, rows: built.plan.rows.slice(0, LIMIT), truncated: built.plan.rows.length > LIMIT }
}

/** Re-plans from the raw input (never trusts a preview) and writes only valid rows. */
export async function applySupplierAssignment(
  formData: FormData,
): Promise<{ created: number; updated: number; deactivated: number; suppliersCreated: number; failed: number } | { error: string }> {
  const supabase = await createClient()
  const createMissing = String(formData.get('create_missing') || '') === '1'
  const access = await authorise(supabase, createMissing)
  if ('error' in access) return access
  const built = await buildPlan(supabase, formData)
  if ('error' in built) return built
  const { plan } = built
  if (plan.counts.error > 0 && String(formData.get('skip_errors') || '') !== '1') {
    return { error: `${plan.counts.error} row${plan.counts.error === 1 ? ' has' : 's have'} errors. Fix them, or tick "skip rows with errors" to apply the rest.` }
  }

  let failed = 0
  const supplierIdByName = new Map<string, string>()
  let suppliersCreated = 0
  for (const name of plan.suppliersToCreate) {
    const { data, error } = await supabase.from('suppliers').insert({ name, status: 'active' }).select('id').single()
    if (error || !data) {
      console.error('[suppliers] bulk create failed', error?.message)
      failed++
      continue
    }
    supplierIdByName.set(name.toLowerCase(), data.id as string)
    suppliersCreated++
  }

  let created = 0
  let updated = 0
  const userId = access.profile.id
  for (const row of plan.rows) {
    if (row.status === 'error' || row.status === 'unchanged') continue
    const supplierId = row.supplierId || supplierIdByName.get(row.supplier.toLowerCase())
    if (!supplierId) {
      failed++
      continue
    }
    if (row.preferred) {
      // One preferred supplier per product scope: clear the others first.
      await supabase.from('product_suppliers').update({ is_preferred: false }).eq('product_id', row.productId).is('variant_id', null)
    }
    if (row.status === 'create') {
      const { error } = await supabase.from('product_suppliers').insert({
        product_id: row.productId,
        variant_id: null,
        supplier_id: supplierId,
        supplier_cost: row.cost,
        supplier_sku: row.supplierSku,
        lead_time_days: row.leadTimeDays,
        moq: row.moq,
        is_preferred: row.preferred,
        status: 'active',
      })
      if (error) {
        console.error('[suppliers] bulk mapping insert failed', error.message)
        failed++
      } else created++
    } else if (row.mappingId) {
      const { error } = await supabase
        .from('product_suppliers')
        .update({
          supplier_cost: row.cost,
          supplier_sku: row.supplierSku,
          lead_time_days: row.leadTimeDays,
          moq: row.moq,
          is_preferred: row.preferred,
          status: 'active',
        })
        .eq('id', row.mappingId)
      if (error) {
        console.error('[suppliers] bulk mapping update failed', error.message)
        failed++
        continue
      }
      updated++
      if (row.costChanged) {
        await supabase.from('supplier_cost_history').insert({ product_supplier_id: row.mappingId, old_cost: row.oldCost, new_cost: row.cost, changed_by: userId })
      }
    }
  }

  let deactivated = 0
  for (const item of plan.deactivate) {
    const { error } = await supabase.from('product_suppliers').update({ status: 'inactive', is_preferred: false }).eq('id', item.mappingId)
    if (error) failed++
    else deactivated++
  }

  await writeAudit(supabase, {
    action: 'bulk_supplier_assignment',
    entity: 'product_suppliers',
    entityId: null,
    next: { created, updated, deactivated, suppliersCreated, failed, mode: String(formData.get('assign_mode') || 'add') },
    userId,
  })
  revalidatePath('/crm/suppliers')
  revalidatePath('/crm/products')
  return { created, updated, deactivated, suppliersCreated, failed }
}
