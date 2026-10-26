import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Heart, Package } from 'lucide-react'
import { formatCurrency, formatUnits } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import { RequestSampleForm } from '@/components/portal/request-sample-form'
import {
  BrowserShortlistImporter,
  RemoveShortlistItem,
  ShortlistQuantity,
} from '@/components/portal/shortlist-item-controls'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  shipped: 'Shipped',
  rejected: 'Rejected',
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

type ClientProduct = {
  id: string
  name: string
  sku: string
  image_url: string | null
  price: number | null
  moq: number | null
  category_name: string | null
  customization_enabled: boolean | null
}

export default async function PortalShortlistPage() {
  const supabase = await createClient()
  const [{ data: companyId }, { data: auth }] = await Promise.all([supabase.rpc('client_company_id'), supabase.auth.getUser()])
  const userId = auth.user?.id

  const [{ data: shortlistRows }, { data: sampleRequests }] = await Promise.all([
    supabase
      .from('company_product_interests')
      .select('id, user_id, product_id, variant_id, quantity, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sample_requests')
      .select('id, product_id, variant_id, quantity, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const productIds = Array.from(
    new Set([...(shortlistRows || []), ...(sampleRequests || [])].map((r) => r.product_id as string)),
  )
  const variantIds = Array.from(new Set((shortlistRows || []).map((r) => r.variant_id).filter(Boolean))) as string[]

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase
          .from('client_products')
          .select('id, name, sku, image_url, price, moq, category_name, customization_enabled')
          .in('id', productIds)
      : Promise.resolve({ data: [] as ClientProduct[] }),
    variantIds.length
      ? supabase.from('client_product_variants').select('id, colour, display_name').in('id', variantIds)
      : Promise.resolve({ data: [] as { id: string; colour: string | null; display_name: string | null }[] }),
  ])

  const productById = new Map(((products || []) as ClientProduct[]).map((p) => [p.id, p]))
  const variantById = new Map((variants || []).map((v) => [v.id as string, v]))

  // Products that were shortlisted but have since been hidden from this company
  // drop out here, because client_products no longer returns them.
  const items = (shortlistRows || []).flatMap((row) => {
    const product = productById.get(row.product_id as string)
    return product ? [{ row, product }] : []
  })

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">My Shortlist</h1>
          <p className="mt-2 text-sm text-gray-600 sm:text-base">
            Gifts your team has saved. Set quantities, request samples, or turn the list into a requirement.
          </p>
        </div>
        {items.length > 0 ? (
          <Link
            href="/portal/requirements/new"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] sm:w-auto"
          >
            Create Requirement from shortlist
          </Link>
        ) : null}
      </div>

      <BrowserShortlistImporter />

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <Heart className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Your shortlist is empty</p>
          <p className="mt-1 text-sm text-gray-500">Tap &ldquo;Add to Shortlist&rdquo; on any gift to save it here.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/portal/catalogue"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224]"
            >
              Browse gifts
            </Link>
            <Link
              href="/portal/catalogues"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#9C7A33] hover:bg-[#F5F7FA]"
            >
              View catalogues
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ row, product }) => {
            const variant = row.variant_id ? variantById.get(row.variant_id as string) : null
            const mine = row.user_id === userId
            return (
              <article key={row.id} className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <Link href={`/portal/catalogue/product/${product.id}`} className="block">
                  <div className="relative aspect-square border-b border-gray-100 bg-[#F5F7FA]">
                    <ProductImage src={product.image_url} alt={product.name} size="md" className="absolute inset-0 h-full w-full" />
                  </div>
                </Link>
                <div className="flex flex-1 flex-col space-y-3 p-4">
                  <div>
                    {product.category_name ? (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{product.category_name}</p>
                    ) : null}
                    <Link href={`/portal/catalogue/product/${product.id}`}>
                      <h3 className="mt-1 text-sm font-semibold text-gray-900 hover:text-[#9C7A33]">{product.name}</h3>
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      SKU {product.sku}
                      {variant?.colour ? ` · ${variant.display_name || variant.colour}` : ''}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {formatCurrency(product.price)}{' '}
                      <span className="text-xs font-normal text-gray-400">· MOQ {formatUnits(product.moq ?? 1)}</span>
                    </p>
                    {!mine ? <p className="mt-1 text-[11px] text-gray-400">Added by a teammate</p> : null}
                  </div>

                  <ShortlistQuantity id={row.id as string} quantity={(row.quantity as number) || 1} editable={mine} />

                  <div className="mt-auto space-y-2 border-t border-gray-100 pt-3">
                    <RequestSampleForm
                      productId={product.id}
                      variantId={(row.variant_id as string) || null}
                      customizationEnabled={Boolean(product.customization_enabled)}
                    />
                    {mine ? <RemoveShortlistItem id={row.id as string} /> : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sample requests</h2>
          <p className="mt-1 text-sm text-gray-500">Status of the samples your team has requested.</p>
        </div>

        {!sampleRequests?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            No sample requests yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Qty</th>
                  <th className="px-4 py-2.5">Requested</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sampleRequests.map((request) => {
                  const product = productById.get(request.product_id as string)
                  return (
                    <tr key={request.id}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {product?.name || (
                          <span className="inline-flex items-center gap-1.5 text-gray-400">
                            <Package size={13} /> Product
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{request.quantity}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {new Date(request.created_at as string).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            STATUS_CLASS[request.status as string] || 'border-gray-200 bg-gray-50 text-gray-600'
                          }`}
                        >
                          {STATUS_LABEL[request.status as string] || request.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
