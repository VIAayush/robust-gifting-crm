/**
 * A client's note on a gift (logo, branding, colour...) travels with the line item: it is written into the line's
 * description as "Product name — note" when a quotation is prepared, and quotation_items.description is copied to
 * order_items.description when the quotation becomes an order. These helpers build and split that description so
 * every screen can show the note under the product name.
 */
const SEPARATOR = ' — '

export function composeItemDescription(productName: string | null | undefined, notes: string | null | undefined): string | null {
  const name = String(productName || '').trim()
  const note = String(notes || '').replace(/\s+/g, ' ').trim().slice(0, 400)
  if (!name) return note || null
  return note ? `${name}${SEPARATOR}${note}` : name
}

/** The note part of a description, or null when the description is just the product name. */
export function itemNote(description: string | null | undefined, productName: string | null | undefined): string | null {
  const text = String(description || '').trim()
  const name = String(productName || '').trim()
  if (!text || !name || text === name) return null
  if (text.startsWith(name + SEPARATOR)) return text.slice(name.length + SEPARATOR.length).trim() || null
  return null
}

/**
 * requirement_products.notes holds the client's own note plus system context joined with " · "
 * ("Client note: …", "Colours: …", "Catalogue: Name at ₹price"). The highlighted notes card shows what the client
 * actually asked for, so the "Catalogue: …" pricing context is left out of it.
 */
export function clientLineNote(notes: string | null | undefined): string | null {
  const parts = String(notes || '')
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && !/^Catalogue:/i.test(part))
    .map((part) => part.replace(/^Client note:\s*/i, ''))
  return parts.length ? parts.join(' · ') : null
}
