// Option B costing (decision D1): costs and profit are never invented, and partial costing never shows as verified profit.
// Unit tests of the pure rules in src/lib/orders/costing.ts. The SQL behaviour is pinned by test-order-cost-rule.mts (text)
// here (recalc_order_cost) and is checked against the real database after migrations 20261033 and 20261039 are applied.
//
// Rule under test (docs/DATABASE_MIGRATION_RUNBOOK.md, D1): a stored 0 cannot be told from "not entered", so an order is
// VERIFIED only when product, printing, courier and other cost are all > 0; with a product cost but a zero component it is
// PROVISIONAL (labelled, never summed); with costs but no product cost it is INCOMPLETE; with no costs NOT ENTERED.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { convertedOrderCost, costingStatus, grossProfitSummary, verifiedCost } from '../src/lib/orders/costing.ts'

// --- verifiedCost: NULL, zero, negative and non-numeric values are never a cost
assert.equal(verifiedCost(null), 0)
assert.equal(verifiedCost(undefined), 0)
assert.equal(verifiedCost(''), 0)
assert.equal(verifiedCost(0), 0)
assert.equal(verifiedCost(-5), 0, 'a negative cost is not a verified cost')
assert.equal(verifiedCost('abc'), 0)
assert.equal(verifiedCost(Number.NaN), 0)
assert.equal(verifiedCost('40.5'), 40.5)

// --- Quotation conversion rule (mirror of migration 20261033)
assert.deepEqual(convertedOrderCost([{ supplier_cost: 40, quantity: 3 }, { supplier_cost: 12.5, quantity: 4 }]), { productCost: 170, unknownLines: 0 }, 'quantity-based sum of actual costs')
assert.deepEqual(convertedOrderCost([{ supplier_cost: 40, quantity: 3 }, { supplier_cost: null, quantity: 4 }]), { productCost: 0, unknownLines: 1 }, 'one missing cost makes the whole order unknown')
assert.deepEqual(convertedOrderCost([{ supplier_cost: 40, quantity: 3 }, { supplier_cost: 0, quantity: 4 }]), { productCost: 0, unknownLines: 1 }, 'zero is unknown, not free')
assert.deepEqual(convertedOrderCost([{ supplier_cost: -9, quantity: 2 }]), { productCost: 0, unknownLines: 1 }, 'negative is unknown')
assert.deepEqual(convertedOrderCost([{ supplier_cost: undefined, quantity: 1 }, { supplier_cost: undefined, quantity: 1 }]), { productCost: 0, unknownLines: 2 })
assert.deepEqual(convertedOrderCost([]), { productCost: 0, unknownLines: 0 })
const lines = [{ supplier_cost: 10, quantity: 7 }]
assert.deepEqual(convertedOrderCost(lines), convertedOrderCost(lines), 'converting twice gives the same amounts')

// --- State 1: NOT ENTERED
for (const input of [
  { order_value: 10000, product_cost: 0, printing_cost: 0, courier_cost: 0, other_cost: 0 },
  { order_value: 5000, product_cost: null, printing_cost: null, courier_cost: null, other_cost: null },
  { order_value: 25000, product_cost: 0, printing_cost: 0, courier_cost: 0, other_cost: 0 }, // a freshly converted order with an unknown line
]) {
  const r = costingStatus(input)
  assert.equal(r.state, 'not_entered')
  assert.equal(r.showProfit, false)
  assert.equal(r.showProvisional, false)
  assert.equal(r.grossProfit, null)
  assert.equal(r.provisionalProfit, null)
  assert.equal(r.productCostEntered, false)
  assert.equal(r.allComponentsEntered, false)
  assert.equal(r.message, 'Costs not entered')
}

// --- State 2: INCOMPLETE (costs entered after creation, but no product cost): no profit of any kind
for (const partial of [{ printing_cost: 500 }, { courier_cost: 120 }, { other_cost: 80 }, { printing_cost: 500, courier_cost: 120, other_cost: 80 }]) {
  const r = costingStatus({ order_value: 10000, product_cost: 0, ...partial })
  assert.equal(r.state, 'incomplete', JSON.stringify(partial))
  assert.equal(r.productCostEntered, false)
  assert.equal(r.showProfit, false)
  assert.equal(r.showProvisional, false, 'no provisional figure either when the product cost is missing')
  assert.equal(r.grossProfit, null)
  assert.equal(r.provisionalProfit, null)
  assert.ok(r.totalCost > 0)
}

// --- State 3: PROVISIONAL (product cost entered, at least one component still 0): shown as provisional, never as verified
const prov = costingStatus({ order_value: 10000, product_cost: 6000, printing_cost: 0, courier_cost: 0, other_cost: 0 })
assert.equal(prov.state, 'provisional')
assert.equal(prov.productCostEntered, true, 'product-cost completeness is reported separately')
assert.equal(prov.allComponentsEntered, false, 'whole-order costing completeness is reported separately')
assert.equal(prov.showProfit, false, 'never verified')
assert.equal(prov.grossProfit, null)
assert.equal(prov.marginPercent, null)
assert.equal(prov.showProvisional, true)
assert.equal(prov.provisionalProfit, 4000)
assert.equal(prov.provisionalMarginPercent, 40)
assert.deepEqual(prov.zeroComponents, ['printing', 'courier', 'other'])
assert.match(prov.message, /^Provisional/)
assert.match(prov.message, /cannot tell a real zero from a cost not yet entered/, 'the limitation is stated on screen')

// Legitimately zero components (for example no printing) cannot be told from missing ones with this schema: still provisional.
const legitZero = costingStatus({ order_value: 10000, product_cost: 6000, printing_cost: 0, courier_cost: 250, other_cost: 100 })
assert.equal(legitZero.state, 'provisional', 'a real zero printing cost cannot be confirmed without the proposed schema change')
assert.equal(legitZero.showProfit, false)
assert.deepEqual(legitZero.zeroComponents, ['printing'])
assert.equal(legitZero.provisionalProfit, 3650)

// --- State 4: VERIFIED (every component entered)
const full = costingStatus({ order_value: '12000.00', product_cost: '6000', printing_cost: '500', courier_cost: '250.50', other_cost: '100' })
assert.equal(full.state, 'verified')
assert.equal(full.productCostEntered, true)
assert.equal(full.allComponentsEntered, true)
assert.equal(full.showProfit, true)
assert.equal(full.showProvisional, false)
assert.equal(full.totalCost, 6850.5)
assert.equal(full.grossProfit, 5149.5)
assert.equal(full.marginPercent, 42.91)
assert.equal(full.provisionalProfit, null)
assert.deepEqual(full.zeroComponents, [])

// Loss-making and zero-value orders are shown honestly; negative components are ignored, never used to inflate profit.
const loss = costingStatus({ order_value: 1000, product_cost: 1500, printing_cost: 10, courier_cost: 10, other_cost: 10 })
assert.equal(loss.state, 'verified')
assert.equal(loss.grossProfit, -530)
assert.equal(costingStatus({ order_value: 0, product_cost: 10, printing_cost: 1, courier_cost: 1, other_cost: 1 }).marginPercent, null)
const negative = costingStatus({ order_value: 1000, product_cost: 400, printing_cost: -300, courier_cost: 5, other_cost: 5 })
assert.equal(negative.state, 'provisional', 'a negative component is not an entered cost')
assert.equal(negative.totalCost, 410)

// --- Dashboard aggregation: only VERIFIED orders are summed; provisional ones are counted, never added
const costs = new Map([
  ['verified1', { product_cost: 6000, printing_cost: 500, courier_cost: 250, other_cost: 250 }], // profit 3000 on 10000
  ['verified2', { product_cost: 100, printing_cost: 50, courier_cost: 10, other_cost: 40 }], // profit 800 on 1000
  ['prov', { product_cost: 6000, printing_cost: 0, courier_cost: 0, other_cost: 0 }], // provisional 4000, must NOT be summed
  ['legit', { product_cost: 500, printing_cost: 0, courier_cost: 20, other_cost: 30 }], // provisional
  ['none', { product_cost: 0, printing_cost: 0, courier_cost: 0, other_cost: 0 }], // not entered
  ['partial', { product_cost: 0, printing_cost: 900, courier_cost: 0, other_cost: 0 }], // incomplete
])
const orders = [
  { id: 'verified1', order_value: 10000 },
  { id: 'verified2', order_value: 1000 },
  { id: 'prov', order_value: 10000 },
  { id: 'legit', order_value: 2000 },
  { id: 'none', order_value: 50000 },
  { id: 'partial', order_value: 20000 },
  { id: 'unknown-order-without-cost-row', order_value: 7000 },
]
assert.deepEqual(
  grossProfitSummary(orders, costs),
  { amount: 3800, verifiedOrders: 2, provisionalOrders: 2, notCostedOrders: 3, totalOrders: 7 },
  'only the two fully costed orders add to the margin',
)
assert.deepEqual(grossProfitSummary([{ id: 'x', order_value: 100 }], new Map()), { amount: 0, verifiedOrders: 0, provisionalOrders: 0, notCostedOrders: 1, totalOrders: 1 })
// A dashboard with only provisional orders reports no margin at all.
assert.equal(grossProfitSummary([{ id: 'prov', order_value: 10000 }], costs).amount, 0)

// --- The database stores the same rule (text check; behaviour is verified against the real database after migration 39)
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const m39 = readFileSync(join(root, 'supabase/migrations/20261039_function_execute_hardening.sql'), 'utf8').replace(/--.*$/gm, '')
const recalc = m39.slice(m39.indexOf('function public.recalc_order_cost'))
for (const column of ['product_cost', 'printing_cost', 'courier_cost', 'other_cost']) {
  assert.ok(new RegExp(`greatest\\(coalesce\\(${column}, 0\\), 0\\) > 0`).test(recalc), `recalc_order_cost stores profit only when ${column} is entered`)
}
assert.ok(/else 0\s+end/.test(recalc), 'recalc_order_cost stores 0 profit otherwise')
assert.ok(/has_any_role\(array\['admin', 'accounts', 'management'\]/.test(recalc), 'recalc_order_cost is limited to the roles that may edit costs')

console.log('order costing tests: all assertions passed')
