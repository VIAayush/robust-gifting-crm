import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Star, Package } from 'lucide-react'
import { formatCurrency, formatUnits } from '@/lib/utils'
import { ProductImage } from '@/components/ui/product-image'
import { removeCompanyInterestForm } from './actions'
import { RequestSampleForm } from '@/components/portal/request-sample-form'

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

export default async function PortalInterestPage() {
  const supabase = await createClient()
  const { data: companyId } = await supabase.rpc('client_company_id')

  const { data: interestRows } = await supabase
    .from('company_product_interests')
    .select('id, product_id, variant_id, quantity, notes, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  const productIds = Array.from(new Set((interestRows || []).map((r) => r.product_id)))
  const variantIds = Array.from(new Set((interestRows || []).map((r) => r.variant_id).filter(Boolean))) as string[]

  const [{ data: products }, { data: variants }, { data: sampleRequests }] = await Promise.all([
    productIds.length
      ? supabase.from('client_products').select('id, name, sku, image_url, price, moq, category_name').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; sku: string; image_url: string | null; price: number | null; moq: number; category_name: string | null }[] }),
    variantIds.length
      ? supabase.from('client_product_variants').select('id, colour, display_name').in('id', variantIds)
      : Promise.resolve({ data: [] as { id: string; colour: string | null; display_name: string | null }[] }),
    supabase
      .from('sample_requests')
      .select('id, product_id, variant_id, quantity, status, requested_date, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const productById = new Map((products || []).map((p) => [p.id, p]))
  const variantById = new Map((variants || []).map((v) => [v.id, v]))

  const items = (interestRows || [])
    .map((row) => ({ row, product: productById.get(row.product_id) }))
    .filter((x): x is { row: NonNullable<typeof interestRows>[number]; product: NonNullable<typeof x.product> } => Boolean(x.product))

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Interest List</h1>
          <p className="mt-2 text-sm text-gray-600 sm:text-base">
            Gifts your team is interested in from your catalogue — request samples or turn these into a requirement.
          </p>
        </div>
        <Link
          href="/portal/requirements/new"
          className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] sm:w-auto"
        >
          Create Requirement
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <Star className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No products in your Interest List yet.</p>
          <Link
            href="/portal/catalogue"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224]"
          >
            Browse catalogue
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ row, product }) => {
            const variant = row.variant_id ? variantById.get(row.variant_id) : null
            return (
              <div key={row.id} className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <Link href={`/portal/catalogue/product/${product.id}`} className="block">
                  <div className="relative aspect-square border-b border-gray-100 bg-[#F5F7FA]">
                    <ProductImage src={product.image_url} alt={product.name} size="md" className="absolute inset-0 h-full w-full" />
                  </div>
                </Link>
                <div className="flex flex-1 flex-col space-y-3 p-4">
                  <div>
                    {product.category_name && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C7A33]">{product.category_name}</p>
                    )}
                    <Link href={`/portal/catalogue/product/${product.id}`}>
                      <h3 className="mt-1 text-sm font-semibold text-gray-900 hover:text-[#9C7A33]">{product.name}</h3>
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      SKU {product.sku}
                      {variant?.colour ? ` · ${variant.display_name || variant.colour}` : ''}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {formatCurrency(product.price)} <span className="text-xs font-normal text-gray-400">· MOQ {formatUnits(product.moq ?? 1)}</span>
                    </p>
                  </div>

                  <div className="mt-auto space-y-2 border-t border-gray-100 pt-3">
                    <RequestSampleForm productId={product.id} variantId={row.variant_id} />
                    <form action={removeCompanyInterestForm}>
                      <input type="hidden" name="interest_id" value={row.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-8 w-full items-center justify-center text-[11px] font-medium text-gray-400 hover:text-red-600"
                      >
                        Remove from Interest List
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sample requests</h2>
          <p className="mt-1 text-sm text-gray-500">Status of the samples you&apos;ve requested from our team.</p>
        </div>

        {!sampleRequests?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            No sample requests yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
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
                  const product = productById.get(request.product_id)
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
                        {new Date(request.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[request.status as string] || 'border-gray-200 bg-gray-50 text-gray-600'}`}
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
