// Order-line supplier assignment, procurement status, and vendor (partner) actions.
// Isolated fake database: RLS and the cost column privileges are NOT exercised (BLOCKED until a database exists).
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb, install, profile, signIn, call, isError, isSuccess, form } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { assignOrderItemSupplier, updateOrderItemProcurement } from '../src/app/crm/orders/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { createPartner, updatePartner, removePartner } from '../src/app/crm/partners/actions.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { friendlyVendorError } from '../src/lib/vendors/errors.ts'

const ORDER_A = 'd0000000-0000-4000-8000-00000000000a'
const ORDER_B = 'd0000000-0000-4000-8000-00000000000b'
const ITEM = 'd1000000-0000-4000-8000-000000000001'
const PRODUCT = 'd2000000-0000-4000-8000-000000000001'
const SUP_OK = 'd3000000-0000-4000-8000-000000000001'
const SUP_BLOCKED = 'd3000000-0000-4000-8000-000000000002'

function world() {
  const db = new FakeDb()
  install(db)
  const ids = { admin: profile(db, 'admin'), ops: profile(db, 'operations'), sales: profile(db, 'sales'), management: profile(db, 'management') }
  db.seed('role_permissions', [
    { role: 'operations', permission_key: 'orders.assign_supplier' },
    { role: 'operations', permission_key: 'orders.procurement' },
  ])
  db.seed('order_items', [{ id: ITEM, order_id: ORDER_A, product_id: PRODUCT, supplier_id: null, procurement_status: 'not_assigned' }])
  db.seed('suppliers', [{ id: SUP_OK, status: 'active' }, { id: SUP_BLOCKED, status: 'blocked' }])
  db.seed('product_suppliers', [{ product_id: PRODUCT, supplier_id: SUP_OK, variant_id: null, supplier_sku: 'S-1', supplier_cost: 42, lead_time_days: 5 }])
  return { db, ids }
}
const line = (db: InstanceType<typeof FakeDb>) => db.rows('order_items')[0] as Record<string, unknown>
const assign = (over: Record<string, string> = {}) => form({ order_item_id: ITEM, order_id: ORDER_A, supplier_id: SUP_OK, ...over })
const procure = (over: Record<string, string> = {}) => form({ order_item_id: ITEM, order_id: ORDER_A, procurement_status: 'po_raised', ...over })

// ---- who may assign / update
for (const role of ['sales', 'management'] as const) {
  const { db, ids } = world()
  signIn(db, ids[role])
  assert.ok(isError(await call(() => assignOrderItemSupplier(assign()))), `${role} cannot assign suppliers`)
  assert.ok(isError(await call(() => updateOrderItemProcurement(procure()))), `${role} cannot change procurement`)
  assert.equal(line(db).supplier_id, null)
}
// ---- the line must belong to the order in the form; bad ids; inactive or unknown supplier
{
  const { db, ids } = world()
  signIn(db, ids.ops)
  assert.ok(isError(await call(() => assignOrderItemSupplier(assign({ order_id: ORDER_B })))), 'a line cannot be changed through another order')
  assert.ok(isError(await call(() => updateOrderItemProcurement(procure({ order_id: ORDER_B })))))
  assert.ok(isError(await call(() => assignOrderItemSupplier(assign({ order_item_id: 'x' })))))
  assert.ok(isError(await call(() => assignOrderItemSupplier(assign({ supplier_id: SUP_BLOCKED })))), 'a blocked supplier cannot be assigned')
  assert.ok(isError(await call(() => assignOrderItemSupplier(assign({ supplier_id: 'd3000000-0000-4000-8000-0000000000ff' })))), 'an unknown supplier is refused')
  assert.equal(line(db).supplier_id, null)
  assert.equal(db.rows('audit_logs').length, 0, 'nothing is audited when nothing changed')
}
// ---- procurement progress needs a supplier
{
  const { db, ids } = world()
  signIn(db, ids.ops)
  assert.ok(isError(await call(() => updateOrderItemProcurement(procure()))), 'po_raised without a supplier is refused')
  assert.ok(isSuccess(await call(() => updateOrderItemProcurement(procure({ procurement_status: 'cancelled' })))), 'cancelling needs no supplier')
  assert.ok(isError(await call(() => updateOrderItemProcurement(procure({ procurement_status: 'bogus' })))))
}
// ---- happy path: snapshot stored on the line, audit trail has before/after but NEVER the cost
{
  const { db, ids } = world()
  signIn(db, ids.ops)
  assert.ok(isSuccess(await call(() => assignOrderItemSupplier(assign()))))
  assert.equal(line(db).supplier_id, SUP_OK)
  assert.equal(line(db).supplier_cost_snapshot, 42, 'the cost snapshot is kept on the line itself')
  assert.equal(line(db).procurement_status, 'supplier_selected')
  const audit = db.rows('audit_logs').at(-1) as { previous_value: Record<string, unknown>; new_value: Record<string, unknown> }
  assert.equal(audit.previous_value.supplier_id, null, 'the previous supplier is recorded')
  assert.equal(audit.new_value.supplier_id, SUP_OK)
  assert.equal(audit.new_value.cost_snapshot_recorded, true)
  assert.ok(!JSON.stringify(audit).includes('42'), 'the supplier cost never reaches the audit log')
  assert.ok(isSuccess(await call(() => updateOrderItemProcurement(procure()))))
  const progress = db.rows('audit_logs').at(-1) as { previous_value: { procurement_status: string }; new_value: { procurement_status: string } }
  assert.deepEqual([progress.previous_value.procurement_status, progress.new_value.procurement_status], ['supplier_selected', 'po_raised'])
}

// ---- vendor (partner) actions
const vendor = (over: Record<string, string> = {}) => form({ table: 'printing_vendors', name: 'Print Co', ...over })
{
  const { db, ids } = world()
  for (const who of ['sales'] as const) {
    signIn(db, ids[who])
    assert.ok(isError(await call(() => createPartner(vendor()))), `${who} cannot manage vendors`)
  }
  signIn(db, ids.management)
  // suppliers are not managed through the partner actions (they have their own permissions and statuses)
  for (const action of [createPartner, updatePartner, removePartner]) {
    const result = await call(() => action(form({ table: 'suppliers', name: 'Sneaky', id: SUP_OK })))
    assert.ok(isError(result) && /Suppliers page/.test(result.error), `${action.name} refuses suppliers`)
  }
  assert.equal(db.rows('suppliers').length, 2, 'no supplier was created or changed')
  assert.deepEqual(db.writes.filter((w: string) => w.startsWith('suppliers:')), [])
  assert.ok(isSuccess(await call(() => createPartner(vendor()))))
  assert.equal(db.rows('printing_vendors').length, 1)
  assert.ok(isError(await call(() => createPartner(vendor({ table: 'users' })))), 'unknown vendor type refused')
  assert.ok(isError(await call(() => createPartner(vendor({ name: ' ' })))))
  // database wording never reaches the screen
  db.writeErrors['printing_vendors'] = { code: '23505', message: 'duplicate key value violates unique constraint "printing_vendors_name_key"' }
  const dup = await call(() => createPartner(vendor()))
  assert.ok(isError(dup) && !/constraint|printing_vendors_name_key/.test(dup.error), `raw database message leaked: ${JSON.stringify(dup)}`)
}
assert.match(friendlyVendorError({ code: '23505', message: 'x' }), /already exists/)
assert.match(friendlyVendorError({ code: '23503', message: 'x' }), /referenced/)
assert.match(friendlyVendorError({ message: 'new row violates row-level security policy for table "x"' }), /permission/)
assert.ok(!/column|table|violates/.test(friendlyVendorError({ message: 'null value in column "name" of relation "x" violates not-null constraint' })))
console.log('procurement and vendor action tests: all assertions passed')
