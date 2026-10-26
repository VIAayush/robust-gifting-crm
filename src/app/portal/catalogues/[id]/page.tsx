import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatUnits, isUuid } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { ProductImage } from '@/components/ui/product-image'
import { ShortlistButton } from '@/components/portal/shortlist-button'
import { RequestQuotationButton } from './request-quotation-button'

export default async function PortalCatalogueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()

  // RLS: only a catalogue published to this client's company is returned, and
  // only the products that company is allowed to see. Client-facing columns only.
  const { data: catalogue } = await supabase
    .from('campaigns')
    .select('id, name, occasion, description, budget_per_employee')
    .eq('id', id)
    .maybeSingle()
  if (!catalogue) notFound()

  const [{ data: offerings }, { data: companyId }] = await Promise.all([
    supabase
      .from('campaign_products')
      .select('id, product_id, display_name, client_description, client_image_url, selling_price, moq')
      .eq('campaign_id', id)
      .eq('visibility', 'published')
      .order('display_order'),
    supabase.rpc('client_company_id'),
  ])
  const items = offerings || []

  const shortlisted = new Set<string>()
  if (items.length) {
    const { data: rows } = await supabase
      .from('company_product_interests')
      .select('product_id')
      .eq('company_id', companyId)
      .is('variant_id', null)
      .in('product_id', items.map((i) => i.product_id as string))
    for (const row of rows || []) shortlisted.add(row.product_id as string)
  }

  return (
    <div className="space-y-6">
      <BackButton href="/portal/catalogues" label="Back to catalogues" className="min-h-10" />

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {catalogue.occasion ? <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{catalogue.occasion}</p> : null}
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{catalogue.name}</h1>
          {catalogue.description ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-gray-600">{catalogue.description}</p> : null}
          <p className="mt-2 text-xs text-gray-500">
            {items.length} gift{items.length === 1 ? '' : 's'}
            {Number(catalogue.budget_per_employee) > 0 ? ` · around ${formatCurrency(catalogue.budget_per_employee)} per person` : ''}
          </p>
        </div>
        {items.length > 0 ? <RequestQuotationButton campaignId={catalogue.id} /> : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          The gifts in this catalogue aren&apos;t available yet. Please check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
              <Link href={`/portal/catalogue/product/${item.product_id}`} className="block">
                <div className="relative aspect-square border-b border-gray-100 bg-[#F5F7FA]">
                  <ProductImage src={item.client_image_url} alt={item.display_name || 'Gift'} size="md" className="absolute inset-0 h-full w-full" />
                </div>
              </Link>
              <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                <div>
                  <Link href={`/portal/catalogue/product/${item.product_id}`}>
                    <h2 className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-[#9C7A33]">{item.display_name}</h2>
                  </Link>
                  {item.client_description ? <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.client_description}</p> : null}
                </div>
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{formatCurrency(item.selling_price)}</p>
                    <p className="text-[10px] text-gray-400">MOQ: {formatUnits(item.moq ?? 1)}</p>
                  </div>
                  <ShortlistButton
                    productId={item.product_id as string}
                    shortlisted={shortlisted.has(item.product_id as string)}
                    sourceOfferingId={item.id as string}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
