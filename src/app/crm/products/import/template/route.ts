import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'

/** Headers-only CSV template. No example row on purpose: an uploaded sample row would create a real product. */
const HEADERS = [
  'name',
  'sku',
  'price',
  'mrp',
  'category',
  'subcategory',
  'description',
  'supplier',
  'supplier_cost',
  'moq',
  'hsn_code',
  'image_filename',
  'image_url',
  'catalogue_access',
  'companies',
  'colour',
  'size',
  'gender',
  'material',
  'extra_price',
  'status',
]

export async function GET() {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'sales')) {
    return new NextResponse('Not permitted', { status: 403 })
  }
  return new NextResponse(`${HEADERS.join(',')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="robust-gifting-product-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
