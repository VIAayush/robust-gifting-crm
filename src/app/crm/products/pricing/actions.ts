'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseCsv, normalizeHeader } from '@/lib/csv'
import { requirePermission } from '@/lib/permissions'
import { writeAudit } from '@/lib/audit'

const MAX_ROWS = 5000
const BATCH_SIZE = 50

export type PricePreviewRow = {
  row: number
  sku: string
  name: string | null
  oldPrice: number | null
  newPrice: number | null
  oldMrp: number | null
  newMrp: number | null
  status: 'change' | 'no_change' | 'error'
  error?: string
}

export type PricePreview = {
  rows: PricePreviewRow[]
  changes: number
  errors: number
  unchanged: number
}

function parseAmount(raw: string): { value: number | null; blank: boolean; invalid: boolean } {
  const cleaned = raw.replace(/[₹,\s]/g, '')
  if (!cleaned) return { value: null, blank: true, invalid: false }
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return { value: null, blank: false, invalid: true }
  return { value: Math.round(n * 100) / 100, blank: false, invalid: false }
}

async function buildPreview(csvText: string): Promise<PricePreview | { error: string }> {
  const table = parseCsv(csvText)
  if (table.headers.length === 0) return { error: 'The CSV file is empty.' }
  const keys = table.headers.map(normalizeHeader)
  const skuIdx = keys.findIndex((k) => ['sku', 'product_code', 'code'].includes(k))
  const priceIdx = keys.findIndex((k) => ['price', 'selling_price', 'sale_price'].includes(k))
  const mrpIdx = keys.findIndex((k) => ['mrp', 'max_retail_price', 'list_price'].includes(k))
  if (skuIdx === -1) return { error: 'The CSV needs a "sku" column.' }
  if (priceIdx === -1 && mrpIdx === -1) return { error: 'The CSV needs a "price" and/or "mrp" column.' }
  if (table.rows.length > MAX_ROWS) return { error: `Please upload at most ${MAX_ROWS} rows at a time.` }

  const skus = table.rows.map((r) => (r[skuIdx] || '').trim().toUpperCase()).filter(Boolean)
  const supabase = await createClient()
  const existing = new Map<string, { id: string; name: string; price: number | null; mrp: number | null }>()
  for (let i = 0; i < skus.length; i += 500) {
    const { data } = await supabase.from('products').select('id, sku, name, price, mrp').in('sku', skus.slice(i, i + 500))
    for (const p of data || []) existing.set(String(p.sku).toUpperCase(), { id: p.id, name: p.name, price: p.price, mrp: p.mrp })
  }

  const seen = new Set<string>()
  const rows: PricePreviewRow[] = table.rows.map((cells, index) => {
    const rowNumber = index + 2
    const sku = (cells[skuIdx] || '').trim().toUpperCase()
    const base = { row: rowNumber, sku, name: null, oldPrice: null, newPrice: null, oldMrp: null, newMrp: null }
    if (!sku) return { ...base, status: 'error' as const, error: 'Missing SKU' }
    if (seen.has(sku)) return { ...base, status: 'error' as const, error: 'Duplicate SKU in this file' }
    seen.add(sku)
    const product = existing.get(sku)
    if (!product) return { ...base, status: 'error' as const, error: 'SKU not found - this tool only updates existing products' }

    const price = priceIdx === -1 ? { value: null, blank: true, invalid: false } : parseAmount(cells[priceIdx] || '')
    const mrp = mrpIdx === -1 ? { value: null, blank: true, invalid: false } : parseAmount(cells[mrpIdx] || '')
    const withProduct = { ...base, name: product.name, oldPrice: product.price, oldMrp: product.mrp }
    if (price.invalid) return { ...withProduct, status: 'error' as const, error: 'Price must be a positive number' }
    if (mrp.invalid) return { ...withProduct, status: 'error' as const, error: 'MRP must be a positive number' }

    // A blank cell means "leave as is", never "clear".
    const newPrice = price.blank ? product.price : price.value
    const newMrp = mrp.blank ? product.mrp : mrp.value
    if (newPrice == null || newPrice <= 0) return { ...withProduct, status: 'error' as const, error: 'Selling price must be greater than 0' }
    if (newMrp != null && newMrp < newPrice) return { ...withProduct, newPrice, newMrp, status: 'error' as const, error: 'MRP cannot be lower than the selling price' }

    const changed = Number(newPrice) !== Number(product.price) || (newMrp ?? null) !== (product.mrp == null ? null : Number(product.mrp))
    return { ...withProduct, newPrice, newMrp, status: changed ? ('change' as const) : ('no_change' as const) }
  })

  return {
    rows,
    changes: rows.filter((r) => r.status === 'change').length,
    errors: rows.filter((r) => r.status === 'error').length,
    unchanged: rows.filter((r) => r.status === 'no_change').length,
  }
}

export async function previewPriceUpdate(formData: FormData): Promise<PricePreview | { error: string }> {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'pricing.manage')
  if ('error' in access) return access
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a CSV file.' }
  if (file.size > 2 * 1024 * 1024) return { error: 'Please keep the CSV under 2 MB.' }
  return buildPreview(await file.text())
}

/** Re-validates from scratch (never trusts the preview) and applies only valid, changed rows. */
export async function applyPriceUpdate(formData: FormData): Promise<{ applied: number; skipped: number; errors: number } | { error: string }> {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'pricing.manage')
  if ('error' in access) return access
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a CSV file.' }

  const preview = await buildPreview(await file.text())
  if ('error' in preview) return preview

  const toApply = preview.rows.filter((r) => r.status === 'change')
  const { data: products } = await supabase.from('products').select('id, sku').in('sku', toApply.map((r) => r.sku))
  const idBySku = new Map((products || []).map((p) => [String(p.sku).toUpperCase(), p.id]))
  const now = new Date().toISOString()
  let applied = 0

  for (let i = 0; i < toApply.length; i += BATCH_SIZE) {
    const batch = toApply.slice(i, i + BATCH_SIZE)
    const history: Record<string, unknown>[] = []
    for (const row of batch) {
      const id = idBySku.get(row.sku)
      if (!id) continue
      const { error } = await supabase
        .from('products')
        .update({ price: row.newPrice, mrp: row.newMrp, price_updated_at: now, updated_at: now })
        .eq('id', id)
      if (error) continue
      applied++
      history.push({
        product_id: id,
        old_price: row.oldPrice,
        new_price: row.newPrice,
        old_mrp: row.oldMrp,
        new_mrp: row.newMrp,
        source: 'csv_bulk',
        changed_by: access.profile.id,
      })
    }
    if (history.length > 0) await supabase.from('product_price_history').insert(history)
  }

  await writeAudit(supabase, {
    action: 'bulk_price_update',
    entity: 'products',
    entityId: null,
    next: { applied, unchanged: preview.unchanged, errors: preview.errors },
    userId: access.profile.id,
  })
  revalidatePath('/crm/products')
  revalidatePath('/crm/products/pricing')
  return { applied, skipped: preview.unchanged, errors: preview.errors }
}

/** Current SKU / name / price / MRP for every product, as CSV - edit it and upload it back. */
export async function exportPriceSheet(): Promise<{ csv: string } | { error: string }> {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'pricing.manage')
  if ('error' in access) return access
  const { data } = await supabase.from('products').select('sku, name, price, mrp, status').order('sku')
  const escape = (value: unknown) => {
    const s = value == null ? '' : String(value)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = ['sku,name,price,mrp,status', ...(data || []).map((p) => [p.sku, p.name, p.price, p.mrp, p.status].map(escape).join(','))]
  return { csv: lines.join('\n') }
}
