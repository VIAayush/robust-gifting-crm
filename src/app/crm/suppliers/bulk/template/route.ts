import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'

/** Headers-only template: no example rows, so nothing can be mapped by accident. */
const HEADERS = ['sku', 'supplier', 'supplier_cost', 'supplier_sku', 'lead_time_days', 'moq', 'preferred']

export async function GET() {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return new NextResponse('Not permitted', { status: 403 })
  const supabase = await createClient()
  const [manage, cost] = await Promise.all([hasPermission(supabase, profile, 'products.supplier_manage'), hasPermission(supabase, profile, 'suppliers.cost_view')])
  if (!manage || !cost) return new NextResponse('Not permitted', { status: 403 })
  return new NextResponse(`${HEADERS.join(',')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="supplier-assignment-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
