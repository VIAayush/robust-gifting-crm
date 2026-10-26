export type ProductFieldErrors = Partial<Record<'name' | 'sku' | 'price' | 'mrp' | 'moq' | 'supplier_cost' | 'category_id', string>>

function readNumber(formData: FormData, key: string): { present: boolean; value: number | null; raw: string } {
  if (!formData.has(key)) return { present: false, value: null, raw: '' }
  const raw = String(formData.get(key) ?? '').trim()
  if (!raw) return { present: true, value: null, raw }
  const value = Number(raw)
  return { present: true, value: Number.isFinite(value) ? value : NaN, raw }
}

/**
 * Product create/edit rules. Only checks fields the form actually sent, so a
 * partial edit form isn't rejected for fields it doesn't contain.
 * `existing` supplies current price/MRP when only one of them is being edited.
 */
export function validateProductForm(
  formData: FormData,
  options: { creating: boolean; existing?: { price: number | null; mrp: number | null; sku?: string | null } },
): ProductFieldErrors {
  const errors: ProductFieldErrors = {}

  if (options.creating || formData.has('name')) {
    const name = String(formData.get('name') || '').trim()
    if (!name) errors.name = 'Product name is required.'
    else if (name.length > 200) errors.name = 'Keep the product name under 200 characters.'
  }

  const submittedSku = String(formData.get('sku') || '').trim()
  const skuChanged = options.creating || (formData.has('sku') && submittedSku.toUpperCase() !== String(options.existing?.sku || '').toUpperCase())
  if (skuChanged) {
    const sku = submittedSku
    if (!sku) errors.sku = 'SKU is required.'
    else if (sku.length > 60) errors.sku = 'Keep the SKU under 60 characters.'
    else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(sku)) errors.sku = 'Use only letters, numbers, dashes, dots and slashes in the SKU.'
  }

  if (options.creating && !String(formData.get('category_id') || '').trim()) errors.category_id = 'Please select a category.'

  const price = readNumber(formData, 'price')
  if (options.creating || price.present) {
    if (price.value === null) errors.price = 'Selling price is required.'
    else if (Number.isNaN(price.value)) errors.price = 'Selling price must be a number.'
    else if (price.value <= 0) errors.price = 'Selling price must be more than ₹0.'
    else if (price.value > 10_000_000) errors.price = 'Selling price looks too large. Please check it.'
  }

  const mrp = readNumber(formData, 'mrp')
  if (mrp.present && mrp.value !== null) {
    const effectivePrice = price.present ? price.value : (options.existing?.price ?? null)
    if (Number.isNaN(mrp.value)) errors.mrp = 'MRP must be a number.'
    else if (mrp.value <= 0) errors.mrp = 'MRP must be more than ₹0, or leave it empty.'
    else if (effectivePrice != null && !Number.isNaN(effectivePrice) && mrp.value < effectivePrice) {
      errors.mrp = 'MRP cannot be lower than the selling price.'
    }
  }

  const moq = readNumber(formData, 'moq')
  if (options.creating || moq.present) {
    if (moq.value === null) errors.moq = 'Minimum order quantity is required.'
    else if (Number.isNaN(moq.value) || !Number.isInteger(moq.value)) errors.moq = 'MOQ must be a whole number.'
    else if (moq.value < 1) errors.moq = 'MOQ must be at least 1.'
    else if (moq.value > 1_000_000) errors.moq = 'MOQ looks too large. Please check it.'
  }

  const cost = readNumber(formData, 'supplier_cost')
  if (cost.present && cost.value !== null) {
    if (Number.isNaN(cost.value)) errors.supplier_cost = 'Supplier cost must be a number.'
    else if (cost.value < 0) errors.supplier_cost = 'Supplier cost cannot be negative.'
  }

  return errors
}

/** Turns a raw Postgres/PostgREST error from a products write into something staff can act on. */
export function friendlyProductDbError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'The product could not be saved. Please try again.'
  const message = error.message || ''
  if (error.code === '23505') {
    if (message.includes('sku')) return 'This SKU is already used by another product. Choose a different SKU.'
    return 'A product with these details already exists.'
  }
  if (error.code === '23514') {
    if (message.includes('products_price_check')) return 'Selling price must be more than ₹0.'
    if (message.includes('products_mrp_check')) return 'MRP must be more than ₹0, or leave it empty.'
    if (message.includes('products_moq_check')) return 'MOQ must be at least 1.'
    if (message.includes('products_supplier_cost_check')) return 'Supplier cost cannot be negative.'
    return 'One of the values is not allowed. Please check the highlighted fields.'
  }
  if (error.code === '22P02') return 'One of the numbers is not valid. Please check the form.'
  return 'The product could not be saved. Please check the form and try again.'
}
