import { createClient } from '@/lib/supabase/server'
import { RequirementWizard, type WizardItem } from './requirement-wizard'

export default async function NewRequirementPage({ searchParams }: { searchParams: Promise<{ catalogue?: string; offerings?: string }> }) {
  const { catalogue: catalogueId, offerings: offeringsParam } = await searchParams
  const supabase = await createClient()
  const { data: companyId } = await supabase.rpc('client_company_id')

  const { data: rows } = await supabase
    .from('company_product_interests')
    .select('id, product_id, variant_id, quantity, notes')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  // Opened from a catalogue: keep only the gifts chosen there (the shortlist also holds older picks from other places).
  let shortlistRows = rows || []
  const offeringIds = String(offeringsParam || '').split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 40)
  if (catalogueId && /^[0-9a-f-]{36}$/i.test(catalogueId) && offeringIds.length) {
    const { data: chosen } = await supabase.from('campaign_products').select('product_id').eq('campaign_id', catalogueId).in('id', offeringIds)
    const chosenProducts = new Set((chosen || []).map((o) => o.product_id as string))
    shortlistRows = shortlistRows.filter((r) => chosenProducts.has(r.product_id as string))
  }

  const productIds = Array.from(new Set(shortlistRows.map((r) => r.product_id as string)))
  const variantIds = Array.from(new Set(shortlistRows.map((r) => r.variant_id).filter(Boolean))) as string[]

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase.from('client_products').select('id, name, sku').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; sku: string }[] }),
    variantIds.length
      ? supabase.from('client_product_variants').select('id, colour, display_name').in('id', variantIds)
      : Promise.resolve({ data: [] as { id: string; colour: string | null; display_name: string | null }[] }),
  ])

  const productById = new Map((products || []).map((p) => [p.id as string, p]))
  const variantById = new Map((variants || []).map((v) => [v.id as string, v]))

  const items: WizardItem[] = shortlistRows.flatMap((row) => {
    const product = productById.get(row.product_id as string)
    if (!product) return []
    const variant = row.variant_id ? variantById.get(row.variant_id as string) : null
    return [
      {
        key: row.id as string,
        product_id: product.id as string,
        variant_id: (row.variant_id as string) || null,
        name: product.name as string,
        sku: product.sku as string,
        colour: variant ? ((variant.display_name || variant.colour) as string | null) : null,
        quantity: (row.quantity as number) || 1,
        notes: (row.notes as string | null) || '',
      },
    ]
  })

  // Opened from a catalogue's "Request quotation": start from the catalogue's name.
  let initialName: string | undefined
  if (catalogueId && /^[0-9a-f-]{36}$/i.test(catalogueId)) {
    const { data: catalogue } = await supabase.from('campaigns').select('name').eq('id', catalogueId).maybeSingle()
    if (catalogue?.name) initialName = `Quotation: ${catalogue.name}`.slice(0, 120)
  }

  // From a catalogue, the quantities the client chose there add up to the requirement's total quantity (still editable in step 2).
  const initialQuantity = initialName && items.length ? String(items.reduce((sum, item) => sum + (item.quantity || 1), 0)) : undefined

  return <RequirementWizard shortlist={items} initialName={initialName} initialQuantity={initialQuantity} />
}
