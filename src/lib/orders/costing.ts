/**
 * One rule for when an order's profit may be shown, and how. Costs are never estimated or invented.
 *
 * LIMITATION (explicit): the four cost columns on an order are NOT NULL with default 0, so with the current schema a
 * stored 0 cannot be told apart from "not entered yet". An order may therefore only be called FULLY COSTED when every
 * component has been entered as a number greater than zero. A component that is genuinely zero (for example no printing)
 * cannot be recorded as "confirmed zero" without a schema change; that change is proposed, not made, in
 * docs/proposed/20261040_order_costs_confirmed.sql. Until it is approved, such an order shows PROVISIONAL profit.
 *
 * States, from the least to the most complete:
 *   not_entered  total cost 0                              no profit, no margin. "Costs not entered".
 *   incomplete   some cost entered but product cost is 0   no profit, no margin (product cost is missing).
 *   provisional  product cost > 0, but at least one of printing / courier / other is 0
 *                                                          profit and margin are shown ONLY as "provisional", clearly
 *                                                          labelled as based on the costs entered, never as verified;
 *                                                          they are NOT counted in dashboard totals.
 *   verified     product, printing, courier and other cost are all > 0
 *                                                          profit and margin are shown as "Gross profit" / "Margin"
 *                                                          and counted in dashboard totals.
 *
 * "Product cost complete" (productCostEntered) and "whole order costing complete" (allComponentsEntered) are separate
 * flags. The database stores gross_profit by the same rule (recalc_order_cost, migration 20261039): stored profit is
 * the VERIFIED profit, and 0 otherwise, so exports straight from the database cannot show an unverified figure.
 */

export type CostingInput = {
  order_value?: number | string | null
  product_cost?: number | string | null
  printing_cost?: number | string | null
  courier_cost?: number | string | null
  other_cost?: number | string | null
}

export type CostingState = 'not_entered' | 'incomplete' | 'provisional' | 'verified'

export type CostingResult = {
  state: CostingState
  /** Product cost has been entered (> 0). */
  productCostEntered: boolean
  /** Product, printing, courier and other cost have ALL been entered (> 0): the only state called verified. */
  allComponentsEntered: boolean
  totalCost: number
  /** Verified profit and margin: only in the 'verified' state, otherwise null. */
  showProfit: boolean
  grossProfit: number | null
  marginPercent: number | null
  /** Provisional profit and margin: only in the 'provisional' state, otherwise null. Never to be summed or presented as verified. */
  showProvisional: boolean
  provisionalProfit: number | null
  provisionalMarginPercent: number | null
  /** Components that are still 0 (printing / courier / other), in the provisional state. */
  zeroComponents: string[]
  message: string
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** A cost counts only when it is a finite number greater than zero; NULL, NaN, 0 and negatives are "not entered". */
export function verifiedCost(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function costingStatus(input: CostingInput): CostingResult {
  const product = verifiedCost(input.product_cost)
  const printing = verifiedCost(input.printing_cost)
  const courier = verifiedCost(input.courier_cost)
  const other = verifiedCost(input.other_cost)
  const totalCost = round2(product + printing + courier + other)
  const orderValue = Number(input.order_value)
  const value = Number.isFinite(orderValue) ? orderValue : 0
  const productCostEntered = product > 0
  const zeroComponents = [
    ...(printing === 0 ? ['printing'] : []),
    ...(courier === 0 ? ['courier'] : []),
    ...(other === 0 ? ['other'] : []),
  ]
  const allComponentsEntered = productCostEntered && zeroComponents.length === 0

  const base = {
    productCostEntered,
    allComponentsEntered,
    totalCost,
    showProfit: false,
    grossProfit: null as number | null,
    marginPercent: null as number | null,
    showProvisional: false,
    provisionalProfit: null as number | null,
    provisionalMarginPercent: null as number | null,
    zeroComponents: [] as string[],
  }

  if (totalCost === 0) return { ...base, state: 'not_entered', message: 'Costs not entered' }
  if (!productCostEntered) {
    return { ...base, state: 'incomplete', message: 'Product cost not entered, so profit and margin are not shown' }
  }

  const profit = round2(value - totalCost)
  const margin = value > 0 ? round2((profit / value) * 100) : null
  if (!allComponentsEntered) {
    return {
      ...base,
      state: 'provisional',
      showProvisional: true,
      provisionalProfit: profit,
      provisionalMarginPercent: margin,
      zeroComponents,
      message: `Provisional: based on the costs entered only. ${zeroComponents.join(', ')} cost is 0 and the system cannot tell a real zero from a cost not yet entered`,
    }
  }
  return { ...base, state: 'verified', showProfit: true, grossProfit: profit, marginPercent: margin, message: 'All cost components entered' }
}

/**
 * The quotation-to-order rule from migration 20261033, as a reference the tests exercise: the cost of an accepted
 * line is known only when its product's supplier_cost is greater than zero; one unknown line makes the whole order "not entered".
 * (The conversion only ever fills the product cost; printing, courier and other cost are entered by staff afterwards,
 * so a converted order is at best provisional until they are.)
 */
export function convertedOrderCost(lines: { supplier_cost: number | null | undefined; quantity: number }[]): { productCost: number; unknownLines: number } {
  let unknownLines = 0
  let sum = 0
  for (const line of lines) {
    const cost = verifiedCost(line.supplier_cost)
    if (cost === 0) unknownLines += 1
    else sum += cost * line.quantity
  }
  return { productCost: unknownLines > 0 ? 0 : round2(sum), unknownLines }
}

export type GrossProfitSummary = {
  /** Sum of VERIFIED profit only. */
  amount: number
  verifiedOrders: number
  provisionalOrders: number
  /** Orders with no costs, or only a partial costing without a product cost. */
  notCostedOrders: number
  totalOrders: number
}

/** Dashboard: only fully costed (verified) orders are summed; provisional orders are counted but never added to the amount. */
export function grossProfitSummary(
  orders: { id: string; order_value?: number | string | null }[],
  costs: Map<string, CostingInput>,
): GrossProfitSummary {
  let paise = 0
  let verifiedOrders = 0
  let provisionalOrders = 0
  for (const order of orders) {
    const row = costs.get(order.id)
    if (!row) continue
    const result = costingStatus({ ...row, order_value: order.order_value })
    if (result.state === 'verified' && result.grossProfit !== null) {
      paise += Math.round(result.grossProfit * 100)
      verifiedOrders += 1
    } else if (result.state === 'provisional') {
      provisionalOrders += 1
    }
  }
  return { amount: paise / 100, verifiedOrders, provisionalOrders, notCostedOrders: orders.length - verifiedOrders - provisionalOrders, totalOrders: orders.length }
}
