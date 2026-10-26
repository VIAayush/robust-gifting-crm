import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'
import { requireStaff } from '@/lib/auth'
import { CatalogueCsvImporter } from '../CatalogueCsvImporter'

export default async function ImportProductsPage() {
  await requireStaff(['admin', 'sales'])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <BackButton href="/crm/products" label="Back to Products" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import catalogue CSV</h1>
        <p className="text-xs text-gray-500 mt-1">
          Manual product creation remains available.{' '}
          <Link href="/crm/products/new" className="text-[#9C7A33] font-semibold hover:underline">
            Add a product
          </Link>
        </p>
      </div>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 text-xs text-gray-700 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">How to upload</h2>
          <a href="/crm/products/import/template" download className="rounded-lg border px-3 py-2 font-semibold text-[#9C7A33] hover:bg-gray-50">
            Download CSV template
          </a>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Download the template and fill one row per product (one row per colour for colour variants, sharing the same SKU).</li>
          <li>Required columns: <strong>name, sku, price, category</strong>. Category and subcategory must already exist; a subcategory must belong to its category.</li>
          <li>Choose the CSV, check that each column is mapped correctly, and optionally attach the product photos referenced in <em>image_filename</em>.</li>
          <li>Click <strong>Validate</strong> first. It is a dry run: it lists every row that would fail and why, and changes nothing.</li>
          <li>Fix the CSV and re-validate until clean, then import. Existing SKUs are only overwritten if &ldquo;overwrite&rdquo; is ticked; SKUs are matched exactly.</li>
          <li>MRP is a separate column and is never used as the selling price. Supplier cost and supplier name are internal and never shown to clients.</li>
        </ol>
      </section>
      <CatalogueCsvImporter />
    </div>
  )
}
