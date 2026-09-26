import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { isUuid, formatCurrency } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { SupplierEditForm } from '@/components/crm/supplier-form'

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireStaff(['admin', 'operations', 'management', 'accounts', 'sales'])
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()

  const [canView, canEdit, canDelete, canSeeCost] = await Promise.all([
    hasPermission(supabase, profile, 'suppliers.view'),
    hasPermission(supabase, profile, 'suppliers.edit'),
    hasPermission(supabase, profile, 'suppliers.delete'),
    hasPermission(supabase, profile, 'suppliers.cost_view'),
  ])
  if (!canView) notFound()

  const [{ data: supplier }, { data: mappings }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('product_suppliers')
      .select('id, supplier_cost, supplier_sku, moq, lead_time_days, is_preferred, status, product:products(id, name, sku), variant:product_variants(id, colour, display_name)')
      .eq('supplier_id', id)
      .order('is_preferred', { ascending: false }),
  ])
  if (!supplier) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <BackButton href="/crm/suppliers" label="Back to Suppliers" />

      {canEdit ? (
        <SupplierEditForm supplier={supplier} canDelete={canDelete} />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-lg font-bold text-gray-900">{supplier.name}</h1>
          <p className="mt-1 text-xs text-gray-500">You do not have permission to edit supplier details.</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-gray-900">Products supplied ({mappings?.length || 0})</h2>
        {(mappings || []).length === 0 ? (
          <p className="text-xs text-gray-400">No products are mapped to this supplier yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-gray-500">
              <tr>
                <th className="py-2">Product</th>
                <th className="py-2">Variant</th>
                <th className="py-2">Supplier SKU</th>
                {canSeeCost && <th className="py-2">Cost</th>}
                <th className="py-2">MOQ</th>
                <th className="py-2">Lead time</th>
                <th className="py-2">Preferred</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(mappings || []).map((m) => {
                const product = Array.isArray(m.product) ? m.product[0] : m.product
                const variant = Array.isArray(m.variant) ? m.variant[0] : m.variant
                return (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="py-2">
                      {product ? (
                        <Link href={`/crm/products/${product.id}`} className="font-semibold text-gray-900 hover:text-[#9C7A33] hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-gray-500">{variant?.display_name || variant?.colour || '—'}</td>
                    <td className="py-2 font-mono text-gray-500">{m.supplier_sku || '—'}</td>
                    {canSeeCost && <td className="py-2 text-gray-700">{m.supplier_cost != null ? formatCurrency(m.supplier_cost) : '—'}</td>}
                    <td className="py-2 text-gray-500">{m.moq ?? '—'}</td>
                    <td className="py-2 text-gray-500">{m.lead_time_days != null ? `${m.lead_time_days}d` : '—'}</td>
                    <td className="py-2">{m.is_preferred ? '★' : ''}</td>
                    <td className="py-2 capitalize text-gray-500">{m.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
