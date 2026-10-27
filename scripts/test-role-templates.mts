import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { ROLE_TEMPLATES, roleTemplateByKey, diffTemplate, templatePermissionKeys } from '../src/lib/role-templates.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { CRM_MODULES } from '../src/lib/modules.ts'

const byKey = (k: string) => roleTemplateByKey(k)!

// Every template only grants modules the role is eligible for.
for (const t of ROLE_TEMPLATES) {
  for (const key of t.modules) {
    const mod = CRM_MODULES.find((m: { key: string }) => m.key === key)
    assert.ok(mod, `${t.key}: unknown module ${key}`)
    assert.ok(mod.eligibleRoles.includes(t.role), `${t.key}: ${key} is not eligible for ${t.role}`)
  }
}

// Order processing: no supplier, cost, pricing or procurement access of any kind.
const ops = byKey('order_processing')
for (const forbidden of ['suppliers', 'pricing', 'products', 'invoices', 'payments', 'payables', 'receivables', 'reports', 'settings', 'permissions', 'team']) {
  assert.ok(!ops.modules.includes(forbidden), `order processing must not have module ${forbidden}`)
}
for (const forbidden of ['suppliers.view', 'suppliers.cost_view', 'products.supplier_manage', 'orders.assign_supplier', 'orders.procurement', 'pricing.manage', 'permissions.manage']) {
  assert.ok(!ops.actions.includes(forbidden), `order processing must not have ${forbidden}`)
}
for (const required of ['orders', 'order_management', 'delivery']) assert.ok(ops.modules.includes(required))

// Sales: no supplier cost, no price changes, no finance, no admin.
const sales = byKey('sales')
for (const forbidden of ['suppliers', 'invoices', 'payments', 'settings', 'permissions', 'team', 'pricing']) assert.ok(!sales.modules.includes(forbidden), `sales must not have ${forbidden}`)
for (const forbidden of ['suppliers.cost_view', 'pricing.manage', 'permissions.manage']) assert.ok(!sales.actions.includes(forbidden))
for (const required of ['leads', 'requirements', 'quotations', 'catalogues']) assert.ok(sales.modules.includes(required))

// Accounts: finance modules, nothing operational or administrative.
const accounts = byKey('accounts')
for (const required of ['invoices', 'payments', 'receivables', 'payables']) assert.ok(accounts.modules.includes(required))
for (const forbidden of ['suppliers', 'orders', 'settings', 'permissions']) assert.ok(!accounts.modules.includes(forbidden))

// Manager: broad, but never permission management, settings or team.
const manager = byKey('manager')
for (const forbidden of ['permissions', 'settings', 'team']) assert.ok(!manager.modules.includes(forbidden))
assert.ok(!manager.actions.includes('permissions.manage'))
assert.ok(manager.modules.includes('reports') && manager.modules.includes('orders'))

// Diff makes a role match the template exactly.
const diff = diffTemplate(ops, ['module.orders', 'module.suppliers', 'pricing.manage'])
assert.ok(diff.remove.includes('module.suppliers') && diff.remove.includes('pricing.manage'))
assert.ok(!diff.remove.includes('module.orders'))
assert.ok(diff.add.includes('module.order_management') && !diff.add.includes('module.orders'))
assert.deepEqual(diffTemplate(ops, templatePermissionKeys(ops)), { add: [], remove: [] })
assert.equal(roleTemplateByKey('admin'), null, 'admin is not a template target')
console.log('role template tests: all assertions passed')
