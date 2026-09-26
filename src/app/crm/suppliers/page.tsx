import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { SupplierCreateForm } from '@/components/crm/supplier-form'
import { Building2 } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  blocked: 'bg-red-50 text-red-700',
}

export default async function SuppliersPage() {
  const profile = await requireStaff(['admin', 'operations', 'management', 'accounts', 'sales'])
  const supabase = await createClient()
  const [canView, canCreate, canSeeCost] = await Promise.all([
    hasPermission(supabase, profile, 'suppliers.view'),
    hasPermission(supabase, profile, 'suppliers.create'),
    hasPermission(supabase, profile, 'suppliers.cost_view'),
  ])
  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">You do not have permission to view suppliers.</p>
      </div>
    )
  }

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, supplier_code, category, city, status, lead_time_days, moq, is_active')
    .order('name', { ascending: true })

  const { data: mappingCounts } = await supabase.from('product_suppliers').select('supplier_id')
  const countBySupplier = new Map<string, number>()
  for (const row of mappingCounts || []) {
    countBySupplier.set(row.supplier_id, (countBySupplier.get(row.supplier_id) || 0) + 1)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Building2 size={22} className="text-[#9C7A33]" /> Suppliers
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Internal vendor master data. Never shown to customers or the client portal.
          </p>
        </div>
      </div>

      {canCreate && <SupplierCreateForm />}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="p-3">Supplier</th>
              <th className="p-3">Code</th>
              <th className="p-3">Category</th>
              <th className="p-3">City</th>
              <th className="p-3">Lead time</th>
              <th className="p-3">MOQ</th>
              <th className="p-3">Products</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(suppliers || []).map((s) => (
              <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-3">
                  <Link href={`/crm/suppliers/${s.id}`} className="font-semibold text-gray-900 hover:text-[#9C7A33] hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="p-3 font-mono text-gray-500">{s.supplier_code || '—'}</td>
                <td className="p-3 text-gray-600">{s.category || '—'}</td>
                <td className="p-3 text-gray-600">{s.city || '—'}</td>
                <td className="p-3 text-gray-600">{s.lead_time_days != null ? `${s.lead_time_days}d` : '—'}</td>
                <td className="p-3 text-gray-600">{s.moq ?? '—'}</td>
                <td className="p-3 text-gray-600">{countBySupplier.get(s.id) || 0}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[s.status] || STATUS_STYLES.active}`}>
                    {s.status || 'active'}
                  </span>
                </td>
              </tr>
            ))}
            {(suppliers || []).length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!canSeeCost && (
        <p className="text-[10px] text-gray-400">Supplier cost figures are hidden for your role.</p>
      )}
    </div>
  )
}
