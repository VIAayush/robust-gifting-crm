import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { classifyPayment, reconcilePayments, PENDING_MIN_AGE_MS, PROCESSING_MIN_AGE_MS, MAX_AGE_MS } from '../src/lib/payments/reconcile.ts'

const now = Date.UTC(2026, 9, 27, 12, 0, 0)
const ago = (ms: number) => new Date(now - ms).toISOString()
const min = 60 * 1000
const pay = (over: Record<string, unknown> = {}) => ({ id: 'p1', checkout_id: 'c1', provider: 'payu', provider_txn_id: 'T1', provider_reference: null, status: 'processing', amount: 1499, created_at: ago(10 * min), hasOrder: false, ...over })

// ---- classification
assert.equal(classifyPayment(pay({ created_at: ago(PROCESSING_MIN_AGE_MS - 1000) }), now), 'skip', 'too fresh: the callback may still be on its way')
assert.equal(classifyPayment(pay({ created_at: ago(PROCESSING_MIN_AGE_MS + 1000) }), now), 'verify')
assert.equal(classifyPayment(pay({ status: 'pending', created_at: ago(PENDING_MIN_AGE_MS - 1000) }), now), 'skip')
assert.equal(classifyPayment(pay({ status: 'pending', created_at: ago(PENDING_MIN_AGE_MS + 1000) }), now), 'verify')
assert.equal(classifyPayment(pay({ created_at: ago(MAX_AGE_MS + 1000) }), now), 'skip', 'old payments are left for manual review')
assert.equal(classifyPayment(pay({ provider: 'demo' }), now), 'skip', 'demo payments have no external truth to ask')
assert.equal(classifyPayment(pay({ status: 'paid', hasOrder: false }), now), 'repair_order')
assert.equal(classifyPayment(pay({ status: 'paid', hasOrder: false, provider: 'demo' }), now), 'repair_order', 'a paid demo payment without an order is repaired too')
assert.equal(classifyPayment(pay({ status: 'paid', hasOrder: true }), now), 'skip')
for (const status of ['failed', 'cancelled', 'refunded']) assert.equal(classifyPayment(pay({ status }), now), 'skip', status)
assert.equal(classifyPayment(pay({ created_at: 'garbage' }), now), 'skip')

// ---- orchestration with recording stubs
function makeDeps(candidates: unknown[], overrides: Record<string, unknown> = {}) {
  const calls: string[] = []
  const deps = {
    listCandidates: async () => candidates,
    verify: async () => ({ ok: true, status: 'paid', providerReference: 'MIH1', raw: {} }),
    claimPaid: async () => { calls.push('claimPaid'); return true },
    claimFailed: async () => { calls.push('claimFailed'); return true },
    markCheckoutFailed: async () => { calls.push('markCheckoutFailed') },
    createOrder: async () => { calls.push('createOrder'); return { orderId: 'o1' } },
    setFailureNote: async (_id: string, note: string | null) => { calls.push(`note:${note}`) },
    notify: async () => { calls.push('notify') },
    ...overrides,
  }
  return { deps, calls }
}

// stuck processing, PayU confirms paid -> claimed, order created, notified
let t = makeDeps([pay()])
let s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, ['claimPaid', 'createOrder', 'notify'])
assert.deepEqual([s.markedPaid, s.ordersCreated, s.errors], [1, 1, 0])

// PayU says failed -> failed, checkout failed, notified, NO order
t = makeDeps([pay()], { verify: async () => ({ ok: true, status: 'failed', failureReason: 'Bank declined', raw: {} }) })
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, ['claimFailed', 'markCheckoutFailed', 'notify'])
assert.deepEqual([s.markedFailed, s.ordersCreated], [1, 0])

// PayU unreachable -> nothing changes
t = makeDeps([pay()], { verify: async () => ({ ok: false, error: 'timeout' }) })
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, [], 'no state change when PayU cannot be asked')
assert.equal(s.stillPending, 1)

// lost the claim race -> no order, no notification from us
t = makeDeps([pay()], { claimPaid: async () => { t.calls.push('claimPaid'); return false } })
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, ['claimPaid'])
assert.equal(s.markedPaid, 0)

// paid but order creation failed earlier -> repaired, failure note cleared
t = makeDeps([pay({ status: 'paid', provider_reference: 'MIH9' })])
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, ['createOrder', 'note:null', 'notify'], 'a repaired order also sends the (deduped) payment notification')
assert.equal(s.ordersCreated, 1)

// repair itself fails -> recorded honestly, counted as an error
t = makeDeps([pay({ status: 'paid' })], { createOrder: async () => ({ error: 'db down' }) })
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, ['note:Paid but order creation failed: db down'])
assert.equal(s.errors, 1)

// paid confirmed by PayU, but the order step fails -> still counted paid, failure note stored, still notified
t = makeDeps([pay()], { createOrder: async () => ({ error: 'items insert failed' }) })
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, ['claimPaid', 'note:Paid but order creation failed: items insert failed', 'notify'])
assert.deepEqual([s.markedPaid, s.errors], [1, 1])

// an exception on one payment does not stop the others
t = makeDeps([pay({ id: 'bad' }), pay({ id: 'good', provider_txn_id: 'T2' })], {
  verify: async (txn: string) => { if (txn === 'T1') throw new Error('boom'); return { ok: true, status: 'paid', providerReference: 'X', raw: {} } },
})
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual([s.errors, s.markedPaid], [1, 1])

// running twice is safe: the second run finds the repaired payment already has an order
t = makeDeps([pay({ status: 'paid', hasOrder: true })])
s = await reconcilePayments(t.deps as never, now)
assert.deepEqual(t.calls, [])
assert.equal(s.checked, 0)
console.log('payment reconciliation tests: all assertions passed')
