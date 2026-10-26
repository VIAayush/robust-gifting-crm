import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { normalizeDomain, parseDomainList, emailAllowed, emailDomain } from '../src/lib/companies/email-domains.ts'

assert.equal(normalizeDomain('  @ACME.com '), 'acme.com')
assert.equal(normalizeDomain('https://www.acme.co.in/about'), 'acme.co.in')
assert.equal(normalizeDomain('not a domain'), '')
assert.equal(normalizeDomain('localhost'), '')
assert.equal(normalizeDomain('-bad-.com'), '')
const parsed = parseDomainList('acme.com, @beta.in\nacme.com  bad_domain')
assert.deepEqual(parsed.domains, ['acme.com', 'beta.in'])
assert.deepEqual(parsed.invalid, ['bad_domain'])
assert.equal(emailDomain('A@B.com'), 'b.com')
assert.equal(emailAllowed('x@acme.com', []), true, 'empty list = unrestricted')
assert.equal(emailAllowed('x@acme.com', null), true)
assert.equal(emailAllowed('x@acme.com', ['acme.com']), true)
assert.equal(emailAllowed('X@ACME.COM', ['acme.com']), true)
assert.equal(emailAllowed('x@mail.acme.com', ['acme.com']), false, 'sub-domains are not implied')
assert.equal(emailAllowed('x@gmail.com', ['acme.com']), false)
assert.equal(emailAllowed('no-at-sign', ['acme.com']), false)
console.log('email domain tests: all assertions passed')
