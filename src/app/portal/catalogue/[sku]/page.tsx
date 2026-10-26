import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

// Old campaign-offering links now open the product page. RLS only returns an
// offering from a catalogue published to this client's company.
export default async function LegacyOfferingRedirect({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params
  if (!isUuid(sku)) notFound()
  const supabase = await createClient()
  const { data } = await supabase.from('campaign_products').select('product_id').eq('id', sku).maybeSingle()
  if (!data?.product_id) notFound()
  redirect(`/portal/catalogue/product/${data.product_id}`)
}
