/** Validation for editing draft quotation lines and header terms. Pure, so it is unit-tested. */

export const MAX_QTY = 1_000_000
export const MAX_UNIT_PRICE = 10_000_000

export type LineInput = { quantity: unknown; unit_price: unknown; discount_percent?: unknown; tax_percent?: unknown }
export type LineValue = { quantity: number; unit_price: number; discount_percent: number; tax_percent: number }

function percent(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null
}

export function validateLine(input: LineInput): { value: LineValue } | { error: string } {
  const quantity = Number(input.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) return { error: 'Quantity must be a whole number of at least 1.' }
  const unitPrice = Number(input.unit_price)
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_UNIT_PRICE) return { error: 'Unit price must be zero or more.' }
  const discount = percent(input.discount_percent, 0)
  if (discount === null) return { error: 'Discount must be between 0 and 100 per cent.' }
  const tax = percent(input.tax_percent, 18)
  if (tax === null) return { error: 'Tax must be between 0 and 100 per cent.' }
  return { value: { quantity, unit_price: Math.round(unitPrice * 100) / 100, discount_percent: discount, tax_percent: tax } }
}

export type HeaderInput = { tax_percent: unknown; discount_percent: unknown; valid_until: unknown; notes: unknown }
export type HeaderValue = { tax_percent: number; discount_percent: number; valid_until: string | null; notes: string | null }

export function validateHeader(input: HeaderInput, today: string): { value: HeaderValue } | { error: string } {
  const tax = percent(input.tax_percent, 18)
  if (tax === null) return { error: 'Tax must be between 0 and 100 per cent.' }
  const discount = percent(input.discount_percent, 0)
  if (discount === null) return { error: 'Discount must be between 0 and 100 per cent.' }
  const validUntil = String(input.valid_until ?? '').trim()
  if (validUntil) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(validUntil))) return { error: 'Enter a valid "valid until" date.' }
    if (validUntil < today) return { error: 'The "valid until" date cannot be in the past.' }
  }
  const notes = String(input.notes ?? '').trim()
  if (notes.length > 2000) return { error: 'Keep the proposal notes under 2,000 characters.' }
  return { value: { tax_percent: tax, discount_percent: discount, valid_until: validUntil || null, notes: notes || null } }
}

/** Only a draft can be edited; once sent it is what the client was shown. */
export function canEditQuotation(status: string | null | undefined) {
  return status === 'draft'
}
