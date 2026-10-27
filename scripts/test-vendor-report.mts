import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { buildVendorLines, totalsByVendor, vendorLinesToCsv, csvCell, parseDateParam, NOT_SET, UNASSIGNED } from '../src/lib/suppliers/vendor-report.ts'

const base = { orderNumber: 'ORD-1', orderDate: '2026-10-01T10:00:00Z', orderStatus: 'delivered', company: 'Acme', sku: 'S1', description: 'Mug', quantity: 10, unitPrice: 100, lineTotal: 1000 }
const lines = buildVendorLines([
  { ...base, vendor: 'Alpha', supplierCostSnapshot: 60 },
  { ...base, orderNumber: 'ORD-2', vendor: 'Alpha', supplierCostSnapshot: null },
  { ...base, orderNumber: 'ORD-3', vendor: null, supplierCostSnapshot: 40 },
  { ...base, orderNumber: 'ORD-4', vendor: 'Beta', supplierCostSnapshot: 0 },
])

assert.equal(lines[0].vendorCostTotal, 600)
assert.equal(lines[0].margin, 400)
assert.equal(lines[0].marginPercent, 40)
assert.equal(lines[1].vendorCostTotal, null, 'missing cost is never invented')
assert.equal(lines[1].margin, null)
assert.equal(lines[2].vendorLabel, UNASSIGNED)
assert.equal(lines[3].vendorCostTotal, 0, 'a recorded zero cost is a real value, not "Not set"')
assert.equal(lines[3].margin, 1000)

const totals = totalsByVendor(lines)
const alpha = totals.find((t: { vendor: string }) => t.vendor === 'Alpha')!
assert.equal(alpha.lines, 2)
assert.equal(alpha.selling, 2000)
assert.equal(alpha.vendorCost, 600, 'only lines with a cost count towards cost')
assert.equal(alpha.sellingWithCost, 1000)
assert.equal(alpha.margin, 400)
assert.equal(alpha.linesWithoutCost, 1)

const csv = vendorLinesToCsv(lines)
const rows = csv.trim().split('\r\n')
assert.equal(rows.length, 5)
assert.ok(rows[2].includes(`${NOT_SET},${NOT_SET},${NOT_SET}`), 'cost, margin and margin % show Not set')
assert.ok(!/NaN|undefined|null/.test(csv))

assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)", 'formula injection is neutralised')
assert.equal(csvCell('@cmd'), "'@cmd")
assert.equal(csvCell(-5), '-5', 'numbers are untouched')
assert.equal(csvCell('a,b'), '"a,b"')
assert.equal(csvCell('say "hi"'), '"say ""hi"""')

assert.equal(parseDateParam('2026-02-30'), null)
assert.equal(parseDateParam('2026-10-01'), '2026-10-01')
assert.equal(parseDateParam(undefined), null)
console.log('vendor report tests: all assertions passed')
