import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVendorLines, type VendorLine } from '@/lib/suppliers/vendor-report'

const MAX_LINES = 20000

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

/**
 * Loads order lines for the vendor report. Cancelled orders are excluded. The caller MUST already have checked
 * suppliers.view and suppliers.cost_view (see the note below on why the service role is used).
 */
export async function loadVendorReport(
  supabase: SupabaseClient,
  filters: { from: string | null; to: string | null; supplierId: string | null },
): Promise<{ lines: VendorLine[]; truncated: boolean } | { error: string }> {
  // supplier_cost_snapshot is not readable through the ordinary API role (migration 20261035), so the report is
  // loaded with the service role. This is only safe because every caller (page and CSV export) has already
  // verified suppliers.view AND suppliers.cost_view for the signed-in user before calling this function.
  const reader = createAdminClient() ?? supabase
  let query = reader
    .from('order_items')
    .select(
      'description, quantity, unit_price, line_total, supplier_cost_snapshot, supplier:suppliers(id, name), product:products(sku), order:orders!inner(order_number, status, created_at, company:companies(name))',
    )
    .neq('order.status', 'cancelled')
    .order('created_at', { referencedTable: 'orders', ascending: false })
    .limit(MAX_LINES + 1)

  if (filters.from) query = query.gte('order.created_at', `${filters.from}T00:00:00+05:30`)
  if (filters.to) query = query.lte('order.created_at', `${filters.to}T23:59:59+05:30`)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)

  const { data, error } = await query
  if (error) {
    console.error('[vendor-report] load failed', error.message)
    return { error: 'The report could not be loaded. If this persists, check that the latest database migrations have been applied.' }
  }
  const rows = data || []
  const truncated = rows.length > MAX_LINES
  const lines = buildVendorLines(
    rows.slice(0, MAX_LINES).map((row) => {
      const order = one(row.order as unknown as { order_number: string; status: string; created_at: string; company: { name: string } | { name: string }[] | null })
      const supplier = one(row.supplier as unknown as { name: string } | { name: string }[] | null)
      const product = one(row.product as unknown as { sku: string } | { sku: string }[] | null)
      const company = one(order?.company)
      return {
        orderNumber: order?.order_number || '',
        orderDate: order?.created_at || '',
        orderStatus: order?.status || '',
        company: company?.name || null,
        vendor: supplier?.name || null,
        sku: product?.sku || null,
        description: String(row.description || ''),
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unit_price) || 0,
        lineTotal: Number(row.line_total) || 0,
        supplierCostSnapshot: row.supplier_cost_snapshot == null ? null : Number(row.supplier_cost_snapshot),
      }
    }),
  )
  return { lines, truncated }
}
