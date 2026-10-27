import { requireStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { formatCurrency, isUuid } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { loadVendorReport } from '@/lib/suppliers/vendor-report-data'
import { NOT_SET, parseDateParam, totalsByVendor } from '@/lib/suppliers/vendor-report'

export const metadata = { title: 'Orders & cost by vendor' }

export default async function VendorReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; supplier?: string }> }) {
  const profile = await requireStaff(['admin', 'operations', 'management', 'accounts'])
  const supabase = await createClient()
  const [canView, canSeeCost] = await Promise.all([
    hasPermission(supabase, profile, 'suppliers.view'),
    hasPermission(supabase, profile, 'suppliers.cost_view'),
  ])
  if (!canView || !canSeeCost) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        This report needs permission to view suppliers and supplier costs.
      </div>
    )
  }

  const params = await searchParams
  const from = parseDateParam(params.from)
  const to = parseDateParam(params.to)
  const supplierId = isUuid(params.supplier) ? params.supplier! : null

  const [{ data: suppliers }, report] = await Promise.all([
    supabase.from('suppliers').select('id, name').order('name'),
    loadVendorReport(supabase, { from, to, supplierId }),
  ])

  const exportQuery = new URLSearchParams()
  if (from) exportQuery.set('from', from)
  if (to) exportQuery.set('to', to)
  if (supplierId) exportQuery.set('supplier', supplierId)

  const input = 'mt-1 rounded-lg border px-3 py-2 text-sm'

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <BackButton href="/crm/suppliers" label="Back to Suppliers" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders &amp; cost by vendor</h1>
        <p className="mt-1 text-xs text-gray-500">
          Order lines with the vendor, the vendor cost recorded when the vendor was assigned, the selling price and the margin. Cancelled orders are excluded.
          A line with no recorded vendor cost shows &ldquo;{NOT_SET}&rdquo; and is left out of cost and margin totals. Internal only.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-xs" method="get">
        <label className="font-medium text-gray-700">From<input type="date" name="from" defaultValue={from || ''} className={`${input} block`} /></label>
        <label className="font-medium text-gray-700">To<input type="date" name="to" defaultValue={to || ''} className={`${input} block`} /></label>
        <label className="font-medium text-gray-700">Vendor
          <select name="supplier" defaultValue={supplierId || ''} className={`${input} block`}>
            <option value="">All vendors</option>
            {(suppliers || []).map((s) => <option key={s.id as string} value={s.id as string}>{s.name as string}</option>)}
          </select>
        </label>
        <button className="min-h-10 rounded-lg bg-[#9C7A33] px-4 font-semibold text-white">Apply filters</button>
        <a href={`/crm/suppliers/vendor-report/export${exportQuery.toString() ? `?${exportQuery}` : ''}`} download className="min-h-10 rounded-lg border px-4 py-2.5 font-semibold text-[#9C7A33] hover:bg-gray-50">Download CSV</a>
      </form>

      {'error' in report ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{report.error}</div>
      ) : (
        <>
          {report.truncated ? <p className="text-xs text-amber-800">More than 20,000 lines match; narrow the dates to see everything.</p> : null}
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr><th className="p-3">Vendor</th><th className="p-3">Lines</th><th className="p-3">Selling total</th><th className="p-3">Vendor cost</th><th className="p-3">Margin</th><th className="p-3">Lines without cost</th></tr>
              </thead>
              <tbody>
                {totalsByVendor(report.lines).map((t) => (
                  <tr key={t.vendor} className="border-t border-gray-100">
                    <td className="p-3 font-semibold text-gray-900">{t.vendor}</td>
                    <td className="p-3">{t.lines}</td>
                    <td className="p-3">{formatCurrency(t.selling)}</td>
                    <td className="p-3">{t.lines === t.linesWithoutCost ? NOT_SET : formatCurrency(t.vendorCost)}</td>
                    <td className="p-3">{t.lines === t.linesWithoutCost ? NOT_SET : formatCurrency(t.margin)}</td>
                    <td className="p-3">{t.linesWithoutCost}</td>
                  </tr>
                ))}
                {report.lines.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-gray-400">No order lines match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr><th className="p-3">Vendor</th><th className="p-3">Order</th><th className="p-3">Item</th><th className="p-3">Qty</th><th className="p-3">Selling</th><th className="p-3">Vendor cost</th><th className="p-3">Margin</th></tr>
              </thead>
              <tbody>
                {report.lines.slice(0, 300).map((line, index) => (
                  <tr key={`${line.orderNumber}-${index}`} className="border-t border-gray-100">
                    <td className="p-3">{line.vendorLabel}</td>
                    <td className="p-3 font-mono">{line.orderNumber}</td>
                    <td className="p-3">{line.description}{line.sku ? <span className="ml-1 font-mono text-gray-400">{line.sku}</span> : null}</td>
                    <td className="p-3">{line.quantity}</td>
                    <td className="p-3">{formatCurrency(line.lineTotal)}</td>
                    <td className="p-3">{line.vendorCostTotal === null ? NOT_SET : formatCurrency(line.vendorCostTotal)}</td>
                    <td className="p-3">{line.margin === null ? NOT_SET : `${formatCurrency(line.margin)}${line.marginPercent !== null ? ` (${line.marginPercent}%)` : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.lines.length > 300 ? <p className="text-xs text-gray-500">Showing the first 300 lines. The CSV contains all {report.lines.length}.</p> : null}
        </>
      )}
    </div>
  )
}
