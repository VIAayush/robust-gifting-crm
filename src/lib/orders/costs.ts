import type { SupabaseClient } from '@supabase/supabase-js'
import { grossProfitSummary, type GrossProfitSummary } from '@/lib/orders/costing'

/**
 * Order cost data is not readable through the normal table API any more (migration 20261035 withdraws
 * SELECT on these columns from every signed-in database role). Authorised staff read it through
 * SECURITY DEFINER functions that check the caller's role/permission, so a direct API query by a client
 * or an unauthorised staff member returns "permission denied" instead of numbers.
 *
 * Until that migration is applied the same data is read straight from the table, so nothing changes for
 * users who were already allowed to see it. Callers must still decide whether to ask at all
 * (canSeeCosts / suppliers.cost_view); the database now enforces the same rule underneath.
 */

/** Every orders column EXCEPT the cost columns. Use instead of select('*') on orders. */
export const ORDER_COLUMNS =
  'id, order_number, company_id, contact_id, quotation_id, owner_id, operations_user_id, supplier_id, printing_vendor_id, courier_partner_id, order_value, po_number, expected_delivery_date, actual_delivery_date, status, notes, created_at, updated_at, assigned_to, current_department_id, stage_due_at, next_action, priority, requirement_id, tracking_number, dispatch_date, campaign_id, order_type, payment_status, payment_reference, storefront_checkout_id, shipping_address' as const

export const ORDER_COST_COLUMNS = ['product_cost', 'printing_cost', 'courier_cost', 'other_cost', 'total_cost', 'gross_profit'] as const

export type OrderCosts = {
  product_cost: number | null
  printing_cost: number | null
  courier_cost: number | null
  other_cost: number | null
  total_cost: number | null
  gross_profit: number | null
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value))

function isMissingFunction(error: { code?: string; message: string } | null) {
  return Boolean(error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message)))
}

function toCosts(row: Record<string, unknown>): OrderCosts {
  return {
    product_cost: num(row.product_cost),
    printing_cost: num(row.printing_cost),
    courier_cost: num(row.courier_cost),
    other_cost: num(row.other_cost),
    total_cost: num(row.total_cost),
    gross_profit: num(row.gross_profit),
  }
}

/** Costs for the given orders, keyed by order id. Empty when the caller is not allowed to see them. */
export async function loadOrderCosts(supabase: SupabaseClient, orderIds: string[]): Promise<Map<string, OrderCosts>> {
  const result = new Map<string, OrderCosts>()
  const ids = Array.from(new Set(orderIds.filter(Boolean)))
  if (ids.length === 0) return result

  const viaFunction = await supabase.rpc('order_cost_summary', { p_order_ids: ids })
  if (!viaFunction.error) {
    for (const row of (viaFunction.data || []) as Record<string, unknown>[]) result.set(String(row.order_id), toCosts(row))
    return result
  }
  if (!isMissingFunction(viaFunction.error)) return result // not permitted (or a real error): show nothing, never guess

  // Migration not applied yet: the columns are still directly readable.
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('orders').select(`id, ${ORDER_COST_COLUMNS.join(', ')}`).in('id', ids.slice(i, i + 200))
    for (const row of (data || []) as unknown as Record<string, unknown>[]) result.set(String(row.id), toCosts(row))
  }
  return result
}

/** Supplier cost recorded against each line of an order, keyed by order-item id. Empty when not permitted. */
export async function loadItemSupplierCosts(supabase: SupabaseClient, orderId: string): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>()
  const viaFunction = await supabase.rpc('order_item_supplier_costs', { p_order_id: orderId })
  if (!viaFunction.error) {
    for (const row of (viaFunction.data || []) as { item_id: string; supplier_cost_snapshot: number | string | null }[]) {
      result.set(row.item_id, num(row.supplier_cost_snapshot))
    }
    return result
  }
  if (!isMissingFunction(viaFunction.error)) return result

  const { data } = await supabase.from('order_items').select('id, supplier_cost_snapshot').eq('order_id', orderId)
  for (const row of (data || []) as { id: string; supplier_cost_snapshot: number | string | null }[]) result.set(row.id, num(row.supplier_cost_snapshot))
  return result
}

/**
 * Gross profit for finance dashboards, summed over FULLY COSTED orders only (see costing.ts): an order whose costs are not
 * entered, partially entered or only provisional never contributes profit. Also reports how many orders fall in each state.
 */
export async function grossProfitFor(
  supabase: SupabaseClient,
  orders: { id: string; order_value?: number | string | null }[],
): Promise<GrossProfitSummary> {
  const costs = await loadOrderCosts(supabase, orders.map((o) => o.id))
  return grossProfitSummary(orders, costs)
}
