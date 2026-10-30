import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { checkStageMove } from '../src/lib/order-workflow.ts'

const ok = (cur: string, to: string, role = 'operations', comment = '') => assert.deepEqual(checkStageMove(cur, to, role, comment), { ok: true }, `${role}: ${cur} -> ${to} "${comment}"`)
const no = (cur: string, to: string, role = 'operations', comment = '') => assert.equal(checkStageMove(cur, to, role, comment).ok, false, `${role}: ${cur} -> ${to} "${comment}" should be refused`)

// one stage forward, every step
const steps = ['created', 'confirmed', 'procurement', 'printing', 'quality_check', 'ready_to_dispatch', 'dispatched', 'delivered']
for (let i = 0; i < steps.length - 1; i++) ok(steps[i], steps[i + 1])
ok('procurement', 'procurement') // hand-off inside a stage
ok('printing', 'cancelled') // cancel an open order

// skipping forward: refused for staff, admin needs a reason
no('created', 'delivered')
no('confirmed', 'printing', 'sales')
no('created', 'delivered', 'admin')
ok('created', 'delivered', 'admin', 'Delivered by hand at the event')
no('created', 'quality_check', 'operations', 'please')

// back one stage needs a reason, two does not work
no('printing', 'procurement')
ok('printing', 'procurement', 'operations', 'Wrong artwork, reprint')
no('quality_check', 'procurement', 'operations', 'too far')
no('dispatched', 'created', 'admin', 'reason')

// closed orders
no('delivered', 'created', 'admin', 'reason')
no('delivered', 'cancelled', 'admin', 'reason')
no('delivered', 'dispatched', 'operations', 'reason')
no('delivered', 'dispatched', 'admin') // no reason
ok('delivered', 'dispatched', 'admin', 'Marked delivered by mistake')
no('cancelled', 'confirmed', 'admin', 'reason')
no('cancelled', 'created', 'operations', 'reason')
no('cancelled', 'created', 'admin')
ok('cancelled', 'created', 'admin', 'Client revived the order')

// legacy in_progress behaves like procurement
ok('in_progress', 'printing')
ok('confirmed', 'in_progress')
console.log('order stage move tests: all assertions passed')
