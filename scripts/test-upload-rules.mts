import assert from 'node:assert/strict'
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { sniffFileType, isValidCustomizationPath, validateEnquiry } from '../src/lib/site/upload-rules.ts'

const bytes = (...b: number[]) => new Uint8Array(b)
assert.equal(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'png')
assert.equal(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpg')
assert.equal(sniffFileType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'webp')
assert.equal(sniffFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31)), 'pdf')
assert.equal(sniffFileType(bytes(0x3c, 0x73, 0x76, 0x67)), null, 'SVG/HTML is not accepted')
assert.equal(sniffFileType(bytes(0x4d, 0x5a, 0x90, 0x00)), null, 'executables are not accepted')
assert.equal(sniffFileType(bytes()), null)

const pid = '123e4567-e89b-42d3-a456-426614174000'
assert.equal(isValidCustomizationPath(`${pid}/1767225600000-abc123.png`, pid), true)
assert.equal(isValidCustomizationPath(`${pid}/1767225600000-abc123.pdf`, pid), true)
assert.equal(isValidCustomizationPath(`other/1767225600000-abc123.png`, pid), false, 'wrong product folder')
assert.equal(isValidCustomizationPath(`${pid}/../secret.png`, pid), false)
assert.equal(isValidCustomizationPath(`${pid}/1767225600000-abc123.exe`, pid), false)
assert.equal(isValidCustomizationPath('anything', 'not-a-uuid'), false)
assert.equal(isValidCustomizationPath(42, pid), false)

const ok = { fullName: 'Asha', email: 'a@b.com', companyName: 'Acme', phone: '+91 98765 43210', quantity: '1,000', message: 'Need gifts' }
assert.equal(validateEnquiry(ok), null)
assert.equal(validateEnquiry({ ...ok, phone: '', quantity: '' }), null, 'phone and quantity are optional')
for (const patch of [{ email: 'x@' }, { email: 'no-at' }, { phone: 'abc' }, { phone: '12' }, { quantity: '-3' }, { quantity: 'many' }, { message: '' }, { fullName: '' }, { companyName: '' }, { message: 'x'.repeat(3001) }]) {
  assert.notEqual(validateEnquiry({ ...ok, ...patch }), null, JSON.stringify(patch))
}
console.log('upload and enquiry rule tests: all assertions passed')
