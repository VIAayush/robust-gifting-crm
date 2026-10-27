// Pure helpers: literal ILIKE matching and the delivery-charge rules. No database involved.
import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { escapeLikePattern, exactIlike } from '../src/lib/security/like.ts'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { baseDeliveryCharge, deliveryChargeFor, freeDeliveryThreshold } from '../src/lib/checkout/delivery.ts'

// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { bearerMatches } from '../src/lib/security/secret.ts'

/** Postgres ILIKE semantics: % = any run, _ = any one character, backslash escapes the next character. */
function ilike(value: string, pattern: string): boolean {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is').test(value)
}

// the escaped pattern matches the typed text exactly (any case) and nothing else
assert.ok(ilike('Ravi@Example.com', exactIlike('ravi@example.com')))
assert.equal(ilike('someone@gmail.com', exactIlike('%@gmail.com')), false, 'a leading % is not a wildcard')
assert.equal(ilike('a1c@example.com', exactIlike('a_c@example.com')), false, 'an underscore is not a single-character wildcard')
assert.ok(ilike('a_c@example.com', exactIlike('a_c@example.com')), 'but it still matches itself')
assert.equal(ilike('x', exactIlike('%')), false)
assert.equal(ilike('anything', exactIlike('%')), false)
assert.equal(ilike('100%', exactIlike('100%')), true)
assert.ok(ilike('back\\slash', exactIlike('back\\slash')), 'a literal backslash survives')
assert.equal(escapeLikePattern('50%_off'), '50\\%\\_off')
assert.equal(exactIlike('  pad@x.com  '), 'pad@x.com', 'surrounding spaces are trimmed')
// without escaping the same input WOULD match other people's records: the reason the helper exists
assert.ok(ilike('someone@gmail.com', '%@gmail.com'))

// delivery: zero or blank threshold means no free delivery, never "everything free"
assert.equal(freeDeliveryThreshold({ free_delivery_above: 0 }), null)
assert.equal(freeDeliveryThreshold({ free_delivery_above: '0' }), null)
assert.equal(freeDeliveryThreshold({ free_delivery_above: -5 }), null)
assert.equal(freeDeliveryThreshold({ free_delivery_above: '' }), null)
assert.equal(freeDeliveryThreshold({ free_delivery_above: null }), null)
assert.equal(freeDeliveryThreshold({ free_delivery_above: 'abc' }), null)
assert.equal(freeDeliveryThreshold(null), null)
assert.equal(freeDeliveryThreshold({ free_delivery_above: '999.50' }), 999.5)
assert.equal(baseDeliveryCharge({ delivery_charge: '80' }), 80)
assert.equal(baseDeliveryCharge({ delivery_charge: -10 }), 0)
assert.equal(baseDeliveryCharge({ delivery_charge: 'x' }), 0)
assert.equal(deliveryChargeFor(500, { delivery_charge: 80, free_delivery_above: 0 }), 80, 'threshold 0 does not make delivery free')
assert.equal(deliveryChargeFor(999, { delivery_charge: 80, free_delivery_above: 1000 }), 80)
assert.equal(deliveryChargeFor(1000, { delivery_charge: 80, free_delivery_above: 1000 }), 0, 'exactly at the threshold is free')
assert.equal(deliveryChargeFor(5000, { delivery_charge: 80, free_delivery_above: null }), 80)
assert.equal(deliveryChargeFor(5000, null), 0)
// cron secret comparison
assert.equal(bearerMatches('Bearer abc123', 'abc123'), true)
assert.equal(bearerMatches('Bearer abc124', 'abc123'), false)
assert.equal(bearerMatches('abc123', 'abc123'), false, 'the Bearer prefix is required')
assert.equal(bearerMatches('Bearer ', ''), false, 'an empty secret never matches')
assert.equal(bearerMatches(null, 'abc123'), false)
assert.equal(bearerMatches('Bearer abc123', undefined), false)
assert.equal(bearerMatches('Bearer abc123extra', 'abc123'), false)
console.log('security helper tests: all assertions passed')
