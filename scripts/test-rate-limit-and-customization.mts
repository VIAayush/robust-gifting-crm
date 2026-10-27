import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { MemoryRateLimiter, clientKeyFromHeaders, checkRateLimit, RATE_RULES } from '../src/lib/security/rate-limit.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { validateCustomization } from '../src/lib/products/customization.ts'

// ---- memory limiter
let clock = 1_000_000
const limiter = new MemoryRateLimiter(() => clock)
for (let i = 0; i < 3; i++) assert.equal(limiter.allow('a', 3, 60), true)
assert.equal(limiter.allow('a', 3, 60), false, '4th attempt in the window is blocked')
assert.equal(limiter.allow('b', 3, 60), true, 'other keys are independent')
clock += 61_000
assert.equal(limiter.allow('a', 3, 60), true, 'window slides: allowed again after it passes')
for (let i = 0; i < 5; i++) limiter.allow('c', 2, 60)
clock += 30_000
assert.equal(limiter.allow('c', 2, 60), false, 'blocked attempts do not extend the block forever')
clock += 31_000
assert.equal(limiter.allow('c', 2, 60), true)

// ---- client key
const h = (v: Record<string, string>) => ({ get: (n: string) => v[n.toLowerCase()] ?? null })
const k1 = clientKeyFromHeaders(h({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }), 'enquiry')
assert.equal(k1, clientKeyFromHeaders(h({ 'x-forwarded-for': '203.0.113.5' }), 'enquiry'), 'first hop is used')
assert.notEqual(k1, clientKeyFromHeaders(h({ 'x-forwarded-for': '203.0.113.6' }), 'enquiry'))
assert.notEqual(k1, clientKeyFromHeaders(h({ 'x-forwarded-for': '203.0.113.5' }), 'upload'), 'bucket is part of the key')
assert.ok(!k1.includes('203'), 'the raw IP is never stored')
assert.equal(clientKeyFromHeaders(h({}), 'x').length, 32)

// ---- database function present / missing / failing
const stub = (result: { data?: unknown; error?: { code?: string; message: string } | null }) => ({ rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }) })
assert.equal(await checkRateLimit(stub({ data: true }) as never, RATE_RULES.enquiry, 'k'), true)
assert.equal(await checkRateLimit(stub({ data: false }) as never, RATE_RULES.enquiry, 'k'), false, 'database says blocked')
// function missing: falls back to memory (first calls allowed, then blocked at the rule limit)
const missing = stub({ error: { code: 'PGRST202', message: 'Could not find the function' } }) as never
const results: boolean[] = []
for (let i = 0; i < RATE_RULES.enquiry.max + 2; i++) results.push(await checkRateLimit(missing, RATE_RULES.enquiry, 'fallback-key'))
assert.deepEqual(results.slice(0, 5), [true, true, true, true, true])
assert.equal(results[5], false)
assert.equal(await checkRateLimit(null, RATE_RULES.upload, 'no-admin'), true, 'no database client: memory window, first call allowed')

// ---- personalisation validation
const all = ['logo_upload', 'personalized_text', 'initials', 'special_instructions']
assert.deepEqual(validateCustomization(all, { personalized_text: ' Happy  Diwali ', initials: 'A.B', special_instructions: 'Gold foil' }, true), {
  ok: true,
  cleaned: { personalized_text: 'Happy Diwali', initials: 'A.B', special_instructions: 'Gold foil' },
})
const fail = (fields: string[], values: Record<string, unknown> | null, file: boolean) => {
  const r = validateCustomization(fields, values, file)
  assert.equal(r.ok, false, JSON.stringify({ fields, values, file }))
  return (r as { error: string }).error
}
assert.match(fail(all, { personalized_text: 'x', initials: 'AB' }, false), /Logo/, 'logo required when offered')
assert.match(fail(all, { initials: 'AB' }, true), /Personalized text is required/)
assert.match(fail(all, { personalized_text: 'x' }, true), /Initials is required/)
assert.match(fail(all, { personalized_text: 'x'.repeat(81), initials: 'AB' }, true), /80 characters/)
assert.match(fail(all, { personalized_text: 'x', initials: 'ABCDEFG' }, true), /6 characters/)
assert.match(fail(all, { personalized_text: 'x', initials: 'A1' }, true), /letters/)
assert.match(fail(all, { personalized_text: 'x', initials: 'AB', special_instructions: 'y'.repeat(501) }, true), /500/)
assert.match(fail(all, null, true), /required/)
assert.deepEqual(validateCustomization(['special_instructions'], null, false), { ok: true, cleaned: {} }, 'optional-only products need nothing')
assert.deepEqual(validateCustomization(['personalized_text'], { personalized_text: 'Hi', unknown_field: 'ignored', initials: 'ZZ' }, false), { ok: true, cleaned: { personalized_text: 'Hi' } }, 'fields the product does not offer are ignored')
assert.deepEqual(validateCustomization([], { personalized_text: 'x' }, false), { ok: true, cleaned: {} })
console.log('rate limit and personalisation tests: all assertions passed')
