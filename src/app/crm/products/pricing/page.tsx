import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { PriceUpdateTool } from '@/components/products/price-update-tool'

export default async function PricingPage() {
  const profile = await requireStaff(['admin', 'sales', 'management', 'operations'])
  const supabase = await createClient()
  const canManage = await hasPermission(supabase, profile, 'pricing.manage')

  const { data: history } = await supabase
    .from('product_price_history')
    .select('id, old_price, new_price, old_mrp, new_mrp, source, changed_at, product:products(name, sku), changer:changed_by(full_name)')
    .order('changed_at', { ascending: false })
    .limit(25)

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <BackButton href="/crm/products" label="Back to Products" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pricing &amp; MRP</h1>
        <p className="mt-1 text-xs text-gray-500">
          Selling price is what customers pay. MRP is shown struck-through on the Personalized (B2C) store when it is higher than the selling price.
        </p>
      </div>

      {canManage ? (
        <PriceUpdateTool />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-xs text-gray-500">
          You can view price history, but your role cannot change prices.
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Recent price changes</h2>
        {(history || []).length === 0 ? (
          <p className="text-xs text-gray-400">No price changes recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="py-2">When</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Price</th>
                  <th className="py-2">MRP</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {(history || []).map((h) => {
                  const product = Array.isArray(h.product) ? h.product[0] : h.product
                  const changer = Array.isArray(h.changer) ? h.changer[0] : h.changer
                  return (
                    <tr key={h.id} className="border-t border-gray-100">
                      <td className="py-2 text-gray-500">{formatDateTime(h.changed_at)}</td>
                      <td className="py-2">
                        <span className="font-semibold text-gray-900">{product?.name || '—'}</span>
                        <span className="ml-1 font-mono text-gray-400">{product?.sku}</span>
                      </td>
                      <td className="py-2">{formatCurrency(h.old_price)} → {formatCurrency(h.new_price)}</td>
                      <td className="py-2">{formatCurrency(h.old_mrp)} → {formatCurrency(h.new_mrp)}</td>
                      <td className="py-2 text-gray-500">{h.source === 'csv_bulk' ? 'Bulk CSV' : 'Manual edit'}</td>
                      <td className="py-2 text-gray-500">{changer?.full_name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
