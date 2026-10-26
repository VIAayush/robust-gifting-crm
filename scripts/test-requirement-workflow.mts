import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { budgetStatus, totalBudget, selectionTotals, clientCanSelectProducts, staffCanCreateQuotation } from '../src/lib/requirements/workflow.ts'

assert.equal(totalBudget(500, 100), 50000)
assert.equal(totalBudget(null, 100), null)
assert.equal(totalBudget(500, 0), null)
assert.equal(budgetStatus(10, null), 'none')
assert.equal(budgetStatus(44999.99, 50000), 'within')
assert.equal(budgetStatus(45000, 50000), 'near')
assert.equal(budgetStatus(50000, 50000), 'near')
assert.equal(budgetStatus(50000.01, 50000), 'over')
const t = selectionTotals([
  { quantity: 3, unitPrice: 0.1 },
  { quantity: 2, unitPrice: 0.2 },
  { quantity: 5, unitPrice: null },
  { quantity: 0, unitPrice: 99 },
])
assert.equal(t.total, 0.7)
assert.equal(t.units, 10)
assert.equal(t.unpriced, 1)
assert.equal(clientCanSelectProducts('admin_approved'), false)
assert.equal(clientCanSelectProducts('submitted'), false)
assert.equal(clientCanSelectProducts('client_confirmed'), true)
assert.equal(staffCanCreateQuotation('selection_submitted'), false)
assert.equal(staffCanCreateQuotation('selection_approved'), true)
console.log('requirement workflow helpers: all assertions passed')
