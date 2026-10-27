import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { BackButton } from '@/components/ui/back-button'
import { BulkSupplierTool } from './bulk-tool'

export const metadata = { title: 'Bulk supplier assignment' }

export default async function BulkSupplierPage() {
  const profile = await requireStaff(['admin', 'operations', 'management', 'accounts', 'sales'])
  const supabase = await createClient()
  const [canManage, canSeeCost, canCreate] = await Promise.all([
    hasPermission(supabase, profile, 'products.supplier_manage'),
    hasPermission(supabase, profile, 'suppliers.cost_view'),
    hasPermission(supabase, profile, 'suppliers.create'),
  ])

  if (!canManage || !canSeeCost) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        Bulk supplier assignment needs permission to manage product suppliers and to view supplier costs.
      </div>
    )
  }

  const { data: suppliers } = await supabase.from('suppliers').select('name').order('name')

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <BackButton href="/crm/suppliers" label="Back to Suppliers" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk supplier assignment</h1>
        <p className="mt-1 text-xs text-gray-500">
          Map existing products to suppliers (with vendor cost) in one go. Only supplier mappings change: product names, SKUs, prices and images are never touched.
          Internal only; nothing here is shown to customers.
        </p>
      </div>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 text-xs text-gray-700">
        <h2 className="mb-2 text-sm font-bold text-gray-900">How to map a new vendor catalogue (for example Subscribe)</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Add any new products first with <strong>Products &rarr; Import catalogue CSV</strong> (validate, then import). Existing SKUs are only overwritten if you tick overwrite.</li>
          <li>Download the template below and list each SKU once per vendor that can supply it, with that vendor&apos;s cost. A product with three vendors has three rows.</li>
          <li>Upload it here and click <strong>Preview (dry run)</strong>. Fix every error shown; unknown suppliers can be created automatically if you tick the box.</li>
          <li>Choose <strong>Add or update</strong> to keep existing suppliers, or <strong>Replace</strong> to switch the others off, then apply.</li>
          <li>Open a product to confirm its suppliers, costs and the preferred supplier. Cost changes are recorded in the cost history.</li>
        </ol>
        <p className="mt-3">
          <a href="/crm/suppliers/bulk/template" download className="font-semibold text-[#9C7A33] hover:underline">Download CSV template</a>
        </p>
      </section>
      <BulkSupplierTool supplierNames={(suppliers || []).map((s) => String(s.name))} canCreateSuppliers={canCreate} />
    </div>
  )
}
