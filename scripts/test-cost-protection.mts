// Isolated tests for cost protection. No database and no network: stub clients stand in for Supabase, and static
// checks read the SQL and source files so the code and the migrations cannot drift apart unnoticed.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { loadProductCosts, loadSupplierMappingCosts, PRODUCT_COLUMNS } from '../src/lib/products/costs.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { loadOrderCosts, loadItemSupplierCosts, ORDER_COLUMNS } from '../src/lib/orders/costs.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

// ---------------------------------------------------------------------------------------------------------------
// 1. Behaviour of the cost readers with a stub client
// ---------------------------------------------------------------------------------------------------------------
type RpcResult = { data?: unknown; error?: { code?: string; message: string } | null }
function stubClient(opts: { rpc: Record<string, RpcResult>; direct?: Record<string, { data?: unknown[]; error?: { message: string } | null }> }) {
  const calls: string[] = []
  const client = {
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`)
      const r = opts.rpc[name] ?? { error: { code: 'PGRST202', message: 'Could not find the function' } }
      return { data: r.data ?? null, error: r.error ?? null }
    },
    from: (table: string) => {
      calls.push(`direct:${table}`)
      const r = opts.direct?.[table] ?? { data: [], error: null }
      const chain = { select: () => chain, in: async () => ({ data: r.data ?? [], error: r.error ?? null }), eq: () => chain }
      return chain
    },
  }
  return { client: client as never, calls }
}

const NOT_PERMITTED = { error: { code: 'P0001', message: 'Not permitted to view product costs' } }

// authorised: values come back through the function
{
  const { client, calls } = stubClient({ rpc: { product_cost_summary: { data: [{ product_id: 'p1', supplier_cost: '120.50', internal_margin: 30, internal_notes: 'n' }] } } })
  const costs = await loadProductCosts(client, ['p1'])
  assert.deepEqual(costs.get('p1'), { supplier_cost: 120.5, internal_margin: 30, internal_notes: 'n' })
  assert.deepEqual(calls, ['rpc:product_cost_summary'], 'authorised path uses only the checked function')
}
// UNAUTHORISED: the function refuses, the result is empty and the table is NEVER read directly as a fallback
{
  const { client, calls } = stubClient({ rpc: { product_cost_summary: NOT_PERMITTED }, direct: { products: { data: [{ id: 'p1', supplier_cost: 999 }] } } })
  const costs = await loadProductCosts(client, ['p1'])
  assert.equal(costs.size, 0)
  assert.deepEqual(calls, ['rpc:product_cost_summary'], 'a refusal must not trigger a direct read')
}
// migration not applied yet: fall back to the direct read (existing behaviour preserved)
{
  const { client, calls } = stubClient({ rpc: {}, direct: { products: { data: [{ id: 'p1', supplier_cost: 10, internal_margin: null, internal_notes: null }] } } })
  const costs = await loadProductCosts(client, ['p1'])
  assert.equal(costs.get('p1')?.supplier_cost, 10)
  assert.deepEqual(calls, ['rpc:product_cost_summary', 'direct:products'])
}
// a database error that is not "function missing" also yields nothing and no direct read
{
  const { client, calls } = stubClient({ rpc: { product_cost_summary: { error: { code: '08006', message: 'connection failure' } } } })
  assert.equal((await loadProductCosts(client, ['p1'])).size, 0)
  assert.deepEqual(calls, ['rpc:product_cost_summary'])
}
// no ids: no calls at all
{
  const { client, calls } = stubClient({ rpc: {} })
  assert.equal((await loadProductCosts(client, ['', ''])).size, 0)
  assert.deepEqual(calls, [])
}

// supplier mapping costs: same three behaviours
{
  const ok = stubClient({ rpc: { product_supplier_costs: { data: [{ id: 'm1', supplier_cost: '55' }, { id: 'm2', supplier_cost: null }] } } })
  const costs = await loadSupplierMappingCosts(ok.client, ['m1', 'm2'])
  assert.equal(costs.get('m1'), 55)
  assert.equal(costs.get('m2'), null, 'a missing cost stays null, never invented')
  const denied = stubClient({ rpc: { product_supplier_costs: { error: { code: 'P0001', message: 'Not permitted to view supplier costs' } } }, direct: { product_suppliers: { data: [{ id: 'm1', supplier_cost: 55 }] } } })
  assert.equal((await loadSupplierMappingCosts(denied.client, ['m1'])).size, 0)
  assert.deepEqual(denied.calls, ['rpc:product_supplier_costs'])
  const legacy = stubClient({ rpc: {}, direct: { product_suppliers: { data: [{ id: 'm1', supplier_cost: 55 }] } } })
  assert.equal((await loadSupplierMappingCosts(legacy.client, ['m1'])).get('m1'), 55)
}

// order readers (same contract): unauthorised gets nothing and no direct fallback
{
  const denied = stubClient({ rpc: { order_cost_summary: { error: { code: 'P0001', message: 'Not permitted to view order costs' } } }, direct: { orders: { data: [{ id: 'o1', product_cost: 5 }] } } })
  assert.equal((await loadOrderCosts(denied.client, ['o1'])).size, 0)
  assert.deepEqual(denied.calls, ['rpc:order_cost_summary'])
  const ok = stubClient({ rpc: { order_cost_summary: { data: [{ order_id: 'o1', product_cost: 5, printing_cost: 1, courier_cost: 2, other_cost: 0, total_cost: 8, gross_profit: 12 }] } } })
  assert.equal((await loadOrderCosts(ok.client, ['o1'])).get('o1')?.gross_profit, 12)
  const itemDenied = stubClient({ rpc: { order_item_supplier_costs: { error: { code: 'P0001', message: 'Not permitted to view supplier costs' } } }, direct: { order_items: { data: [{ id: 'i1', supplier_cost_snapshot: 3 }] } } })
  assert.equal((await loadItemSupplierCosts(itemDenied.client, 'o1')).size, 0)
  assert.deepEqual(itemDenied.calls, ['rpc:order_item_supplier_costs'])
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The column lists in code and the migrations describe exactly the real columns (no drift)
// ---------------------------------------------------------------------------------------------------------------
function tableColumns(table: string): string[] {
  const cols: string[] = []
  const schema = read('supabase/schema.sql')
  const m = schema.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`))
  assert.ok(m, `${table} not found in schema.sql`)
  for (const line of m[1].split('\n')) {
    const t = line.trim().replace(/,$/, '')
    if (t && !t.startsWith('--')) cols.push(t.split(/\s+/)[0])
  }
  const dir = path.join(root, 'supabase/migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(path.join(dir, f), 'utf8')
    for (const alter of sql.matchAll(new RegExp(`alter table (?:if exists )?public\\.${table}\\s+([\\s\\S]*?);`, 'gi'))) {
      for (const add of alter[1].matchAll(/add column if not exists (\w+)/gi)) cols.push(add[1])
    }
  }
  return Array.from(new Set(cols))
}
const set = (s: string) => new Set(s.split(',').map((x) => x.trim()).filter(Boolean))
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))

const PRODUCT_COST_COLS = ['supplier_cost', 'internal_margin', 'internal_notes']
const productAll = new Set(tableColumns('products'))
const productListed = set(PRODUCT_COLUMNS)
for (const c of PRODUCT_COST_COLS) assert.ok(!productListed.has(c), `PRODUCT_COLUMNS must not contain ${c}`)
// every real products column is either listed, a protected cost column, or sales_channel (which has its own migration)
assert.ok(same(new Set([...productListed, ...PRODUCT_COST_COLS, 'sales_channel']), productAll), `PRODUCT_COLUMNS drifted from the products table: ${[...productAll].filter((c) => !productListed.has(c) && !PRODUCT_COST_COLS.includes(c) && c !== 'sales_channel')}`)

const ORDER_COST_COLS = ['product_cost', 'printing_cost', 'courier_cost', 'other_cost', 'total_cost', 'gross_profit']
const orderAll = new Set(tableColumns('orders'))
const orderListed = set(ORDER_COLUMNS)
for (const c of ORDER_COST_COLS) assert.ok(!orderListed.has(c), `ORDER_COLUMNS must not contain ${c}`)
assert.ok(same(new Set([...orderListed, ...ORDER_COST_COLS]), orderAll), `ORDER_COLUMNS drifted from the orders table: ${[...orderAll].filter((c) => !orderListed.has(c) && !ORDER_COST_COLS.includes(c))}`)

// ---------------------------------------------------------------------------------------------------------------
// 3. The migrations withhold exactly those columns, check the caller, and give anon nothing it should not have
// ---------------------------------------------------------------------------------------------------------------
const productMig = read('supabase/migrations/20261037_product_cost_protection.sql')
for (const c of PRODUCT_COST_COLS) assert.match(productMig, new RegExp(`'${c}'`), `migration 37 must withhold ${c}`)
assert.match(productMig, /column_name not in \('supplier_cost', 'internal_margin', 'internal_notes'\)/)
assert.match(productMig, /revoke select on public\.products from anon, authenticated/)
assert.match(productMig, /grant select \(%s\) on public\.products to anon, authenticated/)
assert.match(productMig, /column_name not in \('supplier_cost'\)/)
assert.match(productMig, /grant select \(%s\) on public\.product_suppliers to authenticated/, 'product_suppliers is never granted to anon')
assert.doesNotMatch(productMig, /grant select[^;]*product_suppliers[^;]*anon/i)
assert.match(productMig, /has_any_role\(array\['admin', 'accounts', 'management'\]/, 'product costs: same roles the app already allowed')
assert.match(productMig, /has_permission\('suppliers\.cost_view'\)/, 'supplier costs: gated by the existing permission')
assert.match(productMig, /revoke all on function public\.product_cost_summary\(uuid\[\]\) from public, anon/)
assert.match(productMig, /revoke all on function public\.product_supplier_costs\(uuid\[\]\) from public, anon/)
assert.match(productMig, /security definer/i)
assert.match(productMig, /set search_path = public/i)

const orderMig = read('supabase/migrations/20261035_order_cost_protection.sql')
for (const c of [...ORDER_COST_COLS, 'supplier_cost_snapshot']) assert.match(orderMig, new RegExp(`'${c}'`), `migration 35 must withhold ${c}`)
assert.match(orderMig, /revoke all on function public\.order_cost_summary\(uuid\[\]\) from public, anon/)

// ---------------------------------------------------------------------------------------------------------------
// 4. Source scan: no wildcard reads of the protected tables, and no cost column selected through the user session
// ---------------------------------------------------------------------------------------------------------------
function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}
const PROTECTED_TABLES = ['products', 'orders', 'order_items', 'product_suppliers']
const wildcard: string[] = []
for (const file of walk(path.join(root, 'src'))) {
  const text = readFileSync(file, 'utf8')
  const rel = path.relative(root, file).replaceAll('\\', '/')
  for (const table of PROTECTED_TABLES) {
    // .from('products') ... .select( '*' ...)  within the same call chain (up to the next .from( or 400 chars)
    for (const m of text.matchAll(new RegExp(`from\\('${table}'\\)([\\s\\S]{0,400}?)(?=from\\('|$)`, 'g'))) {
      const sel = m[1].match(/\.select\(\s*([`'"])([\s\S]*?)\1/)
      if (sel && /(^|[,\s(])\*($|[,\s)])/.test(sel[2])) wildcard.push(`${rel}: ${table} select(${sel[2].slice(0, 40)})`)
    }
    // embedded wildcard: products(*) / product:products!inner(*) / orders(*)
    if (new RegExp(`${table}(!inner)?\\(\\*\\)`).test(text)) wildcard.push(`${rel}: embedded ${table}(*)`)
  }
}
assert.deepEqual(wildcard, [], `wildcard reads of protected tables would break after the migrations:\n${wildcard.join('\n')}`)

// Cost columns may only be named in a select by code that uses the service role (after a permission check) or the
// checked-function helpers. Files that legitimately do so are listed here; anything new fails this test.
const MAY_NAME_COST_COLUMNS = new Set([
  'src/lib/products/costs.ts', // checked-function helpers (+ pre-migration fallback)
  'src/lib/orders/costs.ts',
  'src/lib/orders/preferred-suppliers.ts', // service role
  'src/app/crm/orders/actions.ts', // service role read of the mapping cost, after orders.assign_supplier
  'src/app/crm/products/supplier-actions.ts', // service role read of the previous cost, after products.supplier_manage
  'src/app/crm/suppliers/bulk/actions.ts', // service role read, after supplier_manage + cost_view
  'src/lib/suppliers/vendor-report-data.ts', // service role, after suppliers.view + cost_view
  'src/app/crm/samples/actions.ts', // sample_stock.unit_cost (sample purchase cost: separate, documented decision)
  'src/app/crm/reports/page.tsx', // sample_stock.unit_cost
])
const COST_IN_SELECT = /\.select\(\s*([`'"])[^`'"]*\b(supplier_cost|internal_margin|internal_notes|gross_profit|product_cost|printing_cost|courier_cost|other_cost|total_cost|supplier_cost_snapshot)\b/
const offenders: string[] = []
for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file).replaceAll('\\', '/')
  if (MAY_NAME_COST_COLUMNS.has(rel)) continue
  if (COST_IN_SELECT.test(readFileSync(file, 'utf8'))) offenders.push(rel)
}
assert.deepEqual(offenders, [], `these files select a protected cost column through the normal API: ${offenders.join(', ')}`)

console.log('cost protection tests: all assertions passed')
