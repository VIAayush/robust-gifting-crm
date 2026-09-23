'use server'

import { createAdminClient } from '@/lib/supabase/admin'

function clean(value: FormDataEntryValue | null) {
  return String(value || '').trim()
}

type CartLine = { name: string; sku: string; quantity: number; price?: number | null }

function parseCartItems(formData: FormData): CartLine[] {
  try {
    const raw = JSON.parse(clean(formData.get('cart_items')) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((row) => row && typeof row === 'object' && row.name)
      .map((row) => ({
        name: String(row.name),
        sku: String(row.sku || ''),
        quantity: Math.max(1, Math.round(Number(row.quantity)) || 1),
        price: row.price == null ? null : Number(row.price),
      }))
  } catch {
    return []
  }
}

function formatItemLines(items: CartLine[]) {
  return items
    .map((item) => `  - ${item.name}${item.sku ? ` (${item.sku})` : ''} x ${item.quantity}`)
    .join('\n')
}

async function findOrCreateOwner(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin!.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()
  return data?.id || null
}

/**
 * Corporate/bulk path: submits the whole cart as one enquiry, same
 * company → contact → lead pipeline as the existing single-product
 * request-quote form (src/app/request-quote/actions.ts), just with every
 * cart line itemised in the notes instead of one product.
 */
export async function submitCartQuote(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  if (clean(formData.get('fax'))) return { success: true }

  const fullName = clean(formData.get('full_name'))
  const email = clean(formData.get('email')).toLowerCase()
  const companyName = clean(formData.get('company_name'))
  const phone = clean(formData.get('phone'))
  const message = clean(formData.get('message'))
  const items = parseCartItems(formData)

  if (!fullName) return { error: 'Please share your name.' }
  if (!email || !email.includes('@')) return { error: 'Please share a valid work email.' }
  if (!companyName) return { error: 'Please share your company name.' }
  if (items.length === 0) return { error: 'Your cart is empty.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Unable to send this enquiry just now. Please try again shortly.' }

  const notes = [
    'Website cart — bulk quote request',
    formatItemLines(items),
    message ? `Note: ${message}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const ownerId = await findOrCreateOwner(admin)

  const { data: existingCompany } = await admin.from('companies').select('id').ilike('name', companyName).limit(1).maybeSingle()
  let companyId = existingCompany?.id as string | undefined
  if (!companyId) {
    const { data: created, error } = await admin
      .from('companies')
      .insert({ name: companyName, status: 'prospect', owner_id: ownerId, notes: 'Created from the public Robust Gifting cart (bulk quote).' })
      .select('id')
      .single()
    if (error || !created) return { error: 'Unable to save this enquiry. Please try again.' }
    companyId = created.id
  }

  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      full_name: fullName,
      email,
      phone: phone || null,
      contact_type: 'primary',
      kind: 'corporate',
      notes: 'Submitted via the public catalogue cart.',
    })
    .select('id')
    .single()
  if (contactError || !contact) return { error: 'Unable to save this enquiry. Please try again.' }

  const { error: leadError } = await admin.from('leads').insert({
    company_id: companyId,
    contact_id: contact.id,
    owner_id: ownerId,
    source: 'website',
    stage: 'cold',
    notes,
  })
  if (leadError) return { error: 'Unable to save this enquiry. Please try again.' }

  return { success: true }
}

/**
 * Personalized path: captures the order so staff can confirm it and collect
 * payment (no online payment gateway is connected). Reuses the same
 * companies/contacts/leads pipeline as the corporate flow — contacts.kind
 * already supports 'direct' for exactly this case — so it shows up
 * alongside everything else in the CRM leads list, clearly labelled.
 */
export async function submitCartOrder(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  if (clean(formData.get('fax'))) return { success: true }

  const fullName = clean(formData.get('full_name'))
  const email = clean(formData.get('email')).toLowerCase()
  const phone = clean(formData.get('phone'))
  const address = clean(formData.get('delivery_address'))
  const message = clean(formData.get('message'))
  const items = parseCartItems(formData)

  if (!fullName) return { error: 'Please share your name.' }
  if (!email || !email.includes('@')) return { error: 'Please share a valid email.' }
  if (!phone) return { error: 'Please share a phone number so we can confirm your order.' }
  if (!address) return { error: 'Please share a delivery address.' }
  if (items.length === 0) return { error: 'Your cart is empty.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Unable to place this order just now. Please try again shortly.' }

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  const notes = [
    'PERSONALIZED ORDER REQUEST — no payment collected online. Please confirm the order and total with the customer, then collect payment (COD / UPI / bank transfer) before dispatch.',
    formatItemLines(items),
    `Estimated subtotal: ₹${subtotal.toLocaleString('en-IN')} (excludes delivery/customisation)`,
    `Delivery address: ${address}`,
    message ? `Note: ${message}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const ownerId = await findOrCreateOwner(admin)
  const individualLabel = `${fullName} (Individual Customer)`

  const { data: created, error: companyError } = await admin
    .from('companies')
    .insert({ name: individualLabel, status: 'prospect', owner_id: ownerId, notes: 'Individual customer — created from a personalized-gifts cart order.' })
    .select('id')
    .single()
  if (companyError || !created) return { error: 'Unable to place this order. Please try again.' }

  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .insert({
      company_id: created.id,
      full_name: fullName,
      email,
      phone,
      contact_type: 'primary',
      kind: 'direct',
      notes: 'Submitted via the public personalized-gifts cart.',
    })
    .select('id')
    .single()
  if (contactError || !contact) return { error: 'Unable to place this order. Please try again.' }

  const { error: leadError } = await admin.from('leads').insert({
    company_id: created.id,
    contact_id: contact.id,
    owner_id: ownerId,
    source: 'website',
    stage: 'cold',
    estimated_value: subtotal || null,
    notes,
  })
  if (leadError) return { error: 'Unable to place this order. Please try again.' }

  return { success: true }
}
