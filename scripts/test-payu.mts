// Pure-logic PayU tests: hashes, tamper rejection, demo fallback. Dummy credentials only; no network, no database.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.PAYU_KEY = 'TESTKEY'
process.env.PAYU_SALT = 'TESTSALT'
process.env.PAYU_ENVIRONMENT = 'test'

// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
const { PayuPaymentProvider, hashesMatch, isPayuConfigured } = await import('../src/lib/payments/payu-provider.ts')

const sha = (s: string) => crypto.createHash('sha512').update(s).digest('hex')
const provider = new PayuPaymentProvider()

// Request hash: key|txnid|amount|productinfo|firstname|email|udf1..5||||||salt
const input = {
  checkoutId: 'c1',
  txnId: 'TXN123',
  amount: 1499,
  productInfo: 'Order',
  customerName: 'Asha',
  customerEmail: 'asha@example.com',
  customerPhone: '9999999999',
  successUrl: 'https://example.com/ok',
  failureUrl: 'https://example.com/fail',
}
const created = await provider.createPayment(input)
assert.ok(created.redirect)
assert.equal(created.redirect.actionUrl, 'https://test.payu.in/_payment')
assert.equal(created.redirect.fields.amount, '1499.00')
const expectedRequestHash = sha(['TESTKEY', 'TXN123', '1499.00', 'Order', 'Asha', 'asha@example.com', '', '', '', '', '', '', '', '', '', '', 'TESTSALT'].join('|'))
assert.equal(created.redirect.fields.hash, expectedRequestHash)
assert.ok(!JSON.stringify(created.redirect.fields).includes('TESTSALT'), 'salt must never be sent to the browser')

// Response hash: salt|status|||||udf5..udf1|email|firstname|productinfo|amount|txnid|key
function response(status: string, overrides: Record<string, string> = {}) {
  const base: Record<string, string> = { status, email: 'asha@example.com', firstname: 'Asha', productinfo: 'Order', amount: '1499.00', txnid: 'TXN123', ...overrides }
  base.hash = sha(['TESTSALT', base.status, '', '', '', '', '', '', '', '', '', '', base.email, base.firstname, base.productinfo, base.amount, base.txnid, 'TESTKEY'].join('|'))
  return base
}
assert.equal(provider.verifyRedirectHash(response('success')), true)
assert.equal(provider.verifyRedirectHash(response('failure')), true)
const tampered = response('success')
tampered.amount = '1.00'
assert.equal(provider.verifyRedirectHash(tampered), false, 'changed amount must fail')
const flipped = response('failure')
flipped.status = 'success'
assert.equal(provider.verifyRedirectHash(flipped), false, 'changed status must fail')
const noHash = response('success')
delete (noHash as Record<string, string | undefined>).hash
assert.equal(provider.verifyRedirectHash(noHash), false)
assert.equal(provider.verifyRedirectHash({ ...response('success'), hash: response('success').hash.toUpperCase() }), true, 'hex case is irrelevant')

assert.equal(hashesMatch('abc', 'abcd'), false)
assert.equal(hashesMatch('abc', undefined), false)
assert.equal(isPayuConfigured(), true)

// Fallback: without credentials PayU must report unconfigured so the app stays on demo mode.
delete process.env.PAYU_KEY
assert.equal(isPayuConfigured(), false)
assert.equal(provider.verifyRedirectHash(response('success')), false)

console.log('PayU hash / tamper / fallback tests: all assertions passed')
