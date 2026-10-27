import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { isUuid } from '@/lib/utils'
import { loadVendorReport } from '@/lib/suppliers/vendor-report-data'
import { parseDateParam, vendorLinesToCsv } from '@/lib/suppliers/vendor-report'

/** CSV export of the vendor report. Same permission gate as the page: view suppliers AND view supplier costs. */
export async function GET(request: Request) {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return new NextResponse('Not permitted', { status: 403 })
  const supabase = await createClient()
  const [canView, canSeeCost] = await Promise.all([hasPermission(supabase, profile, 'suppliers.view'), hasPermission(supabase, profile, 'suppliers.cost_view')])
  if (!canView || !canSeeCost) return new NextResponse('Not permitted', { status: 403 })

  const url = new URL(request.url)
  const supplier = url.searchParams.get('supplier')
  const report = await loadVendorReport(supabase, {
    from: parseDateParam(url.searchParams.get('from')),
    to: parseDateParam(url.searchParams.get('to')),
    supplierId: supplier && isUuid(supplier) ? supplier : null,
  })
  if ('error' in report) return new NextResponse(report.error, { status: 500 })

  return new NextResponse(vendorLinesToCsv(report.lines), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-cost-by-vendor-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
