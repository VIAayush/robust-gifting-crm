// Audit log must never carry cost or margin figures. Unit tests, one action-level write through writeAudit, and a
// drift check that the database redaction list (migration 38) equals the TypeScript list.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb } from './stubs/harness.mts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { COST_FIELDS, REDACTED_MARKER, redactAuditValue, sensitiveFieldsFor } from '../src/lib/audit-redact.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { summarizeAuditChange } from '../src/lib/audit-summary.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { writeAudit } from '../src/lib/audit.ts'

// every cost field is removed, only names are recorded
const order = { id: 'o1', order_number: 'ORD-1', order_value: 5000, product_cost: 100, printing_cost: 20, courier_cost: 10, other_cost: 5, total_cost: 135, gross_profit: 4865 }
const cleanOrder = redactAuditValue('orders', order) as Record<string, unknown>
for (const key of ['product_cost', 'printing_cost', 'courier_cost', 'other_cost', 'total_cost', 'gross_profit']) assert.ok(!(key in cleanOrder), `${key} removed`)
assert.equal(cleanOrder.order_value, 5000, 'non-cost fields are kept')
assert.deepEqual((cleanOrder[REDACTED_MARKER] as string[]).sort(), ['courier_cost', 'gross_profit', 'other_cost', 'printing_cost', 'product_cost', 'total_cost'])
assert.ok(!JSON.stringify(cleanOrder).includes('4865'), 'no figure survives anywhere in the stored value')

const product = { id: 'p1', name: 'Mug', price: 100, supplier_cost: 40, internal_margin: 20, internal_notes: 'cheap vendor' }
const cleanProduct = redactAuditValue('products', product) as Record<string, unknown>
assert.deepEqual(Object.keys(cleanProduct).sort(), ['id', 'name', 'price', REDACTED_MARKER].sort())
assert.ok(!JSON.stringify(cleanProduct).includes('cheap vendor'))
// internal_notes is only sensitive on products
assert.equal((redactAuditValue('companies', { internal_notes: 'prefers email' }) as { internal_notes: string }).internal_notes, 'prefers email')
// nothing to redact: the same object comes back untouched
const plain = { id: 'x', name: 'n' }
assert.equal(redactAuditValue('leads', plain), plain)
assert.equal(redactAuditValue('orders', null), null)
assert.equal(redactAuditValue('orders', 'text'), 'text')
assert.deepEqual(redactAuditValue('orders', [1, 2]), [1, 2])

// writeAudit stores the redacted value (the write most callers use)
{
  const db = new FakeDb()
  await writeAudit(db.client() as never, { action: 'update', entity: 'product_suppliers', entityId: 'e', previous: { supplier_cost: 10, status: 'active' }, next: { supplier_cost: 12, status: 'active' }, userId: 'u1' })
  const row = db.rows('audit_logs')[0] as { previous_value: Record<string, unknown>; new_value: Record<string, unknown> }
  assert.ok(!('supplier_cost' in row.previous_value) && !('supplier_cost' in row.new_value))
  assert.equal(row.new_value.status, 'active')
  assert.ok(!JSON.stringify(row).includes('12'), 'the figure is not stored')
}

// summaries never print a cost, even for rows written before redaction existed
const summary = summarizeAuditChange({ name: 'Mug', supplier_cost: 40, internal_margin: 20 }, { name: 'Mug', supplier_cost: 55, internal_margin: 25 })
assert.ok(!/40|55|25|supplier cost|margin/i.test(summary), `summary leaked a cost: ${summary}`)
assert.ok(!/55/.test(summarizeAuditChange(null, { name: 'Mug', supplier_cost: 55 })))
assert.match(summarizeAuditChange({ status: 'draft' }, { status: 'sent' }), /draft/, 'ordinary changes still read normally')

// the database list equals the TypeScript list (drift test)
const sql = readFileSync(new URL('../supabase/migrations/20261038_security_hardening.sql', import.meta.url), 'utf8')
const list = sql.match(/v_keys text\[\] := array\[([^\]]*)\]/)
assert.ok(list, 'audit_redact key list found in migration 38')
const sqlKeys = [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
assert.deepEqual(sqlKeys, [...COST_FIELDS].sort(), 'SQL and TypeScript cost field lists must match')
assert.ok(/if p_entity in \('products', 'product'\) then v_keys := v_keys \|\| array\['internal_notes'\]/.test(sql))
assert.deepEqual(sensitiveFieldsFor('products').filter((k: string) => !COST_FIELDS.includes(k as never)), ['internal_notes'])
// the own-rows read must exclude every cost-bearing entity; the insert policy must require an internal user
assert.ok(/user_id = auth\.uid\(\) and entity not in \('orders', 'order_items', 'products', 'product', 'product_suppliers', 'product_supplier'\)/.test(sql))
assert.ok(/create policy audit_insert[\s\S]{0,200}is_internal\(\)/.test(sql))
console.log('audit redaction tests: all assertions passed')
