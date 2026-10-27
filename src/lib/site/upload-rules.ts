/** Rules for customer-uploaded personalisation files and public enquiry fields. Pure, so they are unit-tested. */

export type FileKind = 'png' | 'jpg' | 'webp' | 'pdf'

/** Detects the real file type from its first bytes; the browser-declared MIME type is not trusted. */
export function sniffFileType(bytes: Uint8Array): FileKind | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (bytes.length >= 8 && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (bytes.length >= 3 && startsWith([0xff, 0xd8, 0xff])) return 'jpg'
  if (bytes.length >= 12 && startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  if (bytes.length >= 5 && startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A storage path the upload action could have produced for this product: "<productId>/<millis>-<token>.<ext>". */
export function isValidCustomizationPath(path: unknown, productId: string): path is string {
  if (typeof path !== 'string' || !UUID_RE.test(productId)) return false
  const escaped = productId.toLowerCase()
  return new RegExp(`^${escaped}/\\d{10,15}-[a-z0-9]{1,12}\\.(png|jpg|webp|pdf)$`).test(path.toLowerCase()) && !path.includes('..')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEnquiry(input: { email: string; phone: string; quantity: string; message: string; fullName: string; companyName: string }): string | null {
  if (!input.fullName) return 'Please share your name.'
  if (input.fullName.length > 100) return 'Please keep your name under 100 characters.'
  if (!EMAIL_RE.test(input.email) || input.email.length > 254) return 'Please share a valid work email.'
  if (!input.companyName) return 'Please share your company name.'
  if (input.companyName.length > 150) return 'Please keep the company name under 150 characters.'
  if (input.phone) {
    const digits = input.phone.replace(/[\s()+-]/g, '')
    if (!/^\d{7,15}$/.test(digits)) return 'Please share a valid phone number, or leave it blank.'
  }
  if (input.quantity) {
    const q = Number(input.quantity.replace(/,/g, ''))
    if (!Number.isFinite(q) || q < 1 || q > 10_000_000) return 'Please enter the approximate quantity as a number.'
  }
  if (!input.message) return 'Please tell us a little about the gifting need.'
  if (input.message.length > 3000) return 'Please keep your message under 3,000 characters.'
  return null
}
