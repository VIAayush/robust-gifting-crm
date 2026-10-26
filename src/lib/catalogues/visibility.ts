export type VisibilityProduct = {
  id: string
  name: string | null
  status: string | null
  catalogue_access: string | null
  price: number | null
  image_url: string | null
  category_name: string | null
}

export type VisibilityIssue = { kind: 'internal' | 'inactive' | 'incomplete' | 'restricted'; message: string; hiddenFrom?: string[] }

/**
 * Mirrors the public.client_products rules (the database is what actually
 * enforces this for clients) so the CRM can warn before a client misses a product.
 */
export function catalogueVisibilityIssues(
  product: VisibilityProduct,
  assignedCompanies: { id: string; name: string }[],
  accessCompanyIds: Set<string>,
): VisibilityIssue[] {
  const issues: VisibilityIssue[] = []
  if (product.status !== 'active') {
    issues.push({ kind: 'inactive', message: 'Product is not active, so no client sees it.' })
    return issues
  }
  if (product.catalogue_access === 'none') {
    issues.push({ kind: 'internal', message: 'Internal only: hidden from every client.' })
    return issues
  }
  const missing: string[] = []
  if (!product.price || Number(product.price) <= 0) missing.push('price')
  if (!product.image_url || !product.image_url.trim()) missing.push('photo')
  if (!product.category_name) missing.push('category')
  if (!product.name || !product.name.trim()) missing.push('name')
  if (missing.length) {
    issues.push({ kind: 'incomplete', message: `Hidden from clients until it has a ${missing.join(', ')}.` })
    return issues
  }
  if (product.catalogue_access === 'selected') {
    const hiddenFrom = assignedCompanies.filter((c) => !accessCompanyIds.has(c.id)).map((c) => c.name)
    if (hiddenFrom.length) {
      issues.push({
        kind: 'restricted',
        message: `Only visible to selected companies; hidden from ${hiddenFrom.join(', ')}.`,
        hiddenFrom,
      })
    }
  }
  return issues
}
