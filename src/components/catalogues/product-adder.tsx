'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { addCatalogueProducts, addCatalogueProductsByFilter } from '@/app/crm/products/catalogues/actions'
import { Feedback } from '@/components/catalogues/catalogue-controls'
import { ProductImage } from '@/components/ui/product-image'
import { formatCurrency } from '@/lib/utils'
import type { CandidateFilter, CandidateRow } from '@/lib/catalogues/candidates'

type Option = { id: string; name: string }

export function ProductAdder({
  campaignId,
  basePath,
  filter,
  rows,
  total,
  page,
  pageSize,
  inCatalogue,
  categories,
  suppliers,
  canEdit,
  loadError,
}: {
  campaignId: string
  basePath: string
  filter: CandidateFilter
  rows: CandidateRow[]
  total: number
  page: number
  pageSize: number
  inCatalogue: string[]
  categories: Option[]
  suppliers: Option[]
  canEdit: boolean
  loadError?: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const already = new Set(inCatalogue)
  const selectable = rows.filter((r) => !already.has(r.id))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged: Record<string, string | undefined> = {
      tab: filter.mode,
      q: filter.q,
      category: filter.categoryId,
      min: filter.minPrice,
      max: filter.maxPrice,
      supplier: filter.supplierId,
      page: String(page),
      ...overrides,
    }
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value)
    if (params.get('page') === '1') params.delete('page')
    return `${basePath}?${params.toString()}#add-products`
  }

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setResult(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setResult({ ok: false, text: res.error })
      else {
        setResult({ ok: true, text: res.message || 'Added.' })
        setSelected(new Set())
        router.refresh()
      }
    })
  }

  const field = 'min-h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm'

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b" role="tablist">
        {[
          { mode: 'search', label: 'Search all products' },
          { mode: 'supplier', label: 'Add from supplier' },
        ].map((tab) => (
          <Link
            key={tab.mode}
            role="tab"
            aria-selected={filter.mode === tab.mode}
            href={`${basePath}?tab=${tab.mode}#add-products`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              filter.mode === tab.mode ? 'border-[#9C7A33] text-[#9C7A33]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={filter.mode} />
        {filter.mode === 'supplier' ? (
          <label className="text-xs font-medium text-gray-600">
            Supplier
            <select name="supplier" defaultValue={filter.supplierId || ''} className={`${field} mt-1 block w-56`}>
              <option value="">Choose a supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="min-w-0 flex-1 text-xs font-medium text-gray-600">
          Name or SKU
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input name="q" defaultValue={filter.q || ''} placeholder="Search" className={`${field} w-full pl-8`} />
          </span>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Category
          <select name="category" defaultValue={filter.categoryId || ''} className={`${field} mt-1 block w-44`}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {filter.mode === 'search' ? (
          <>
            <label className="text-xs font-medium text-gray-600">
              Min ₹
              <input name="min" type="number" min={0} defaultValue={filter.minPrice || ''} className={`${field} mt-1 block w-24`} />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Max ₹
              <input name="max" type="number" min={0} defaultValue={filter.maxPrice || ''} className={`${field} mt-1 block w-24`} />
            </label>
          </>
        ) : null}
        <button type="submit" className="min-h-9 rounded-lg border border-[#E2E8F0] bg-gray-50 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100">
          Filter
        </button>
      </form>

      {loadError ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">Could not load products: {loadError}</p> : null}

      {filter.mode === 'supplier' && !filter.supplierId ? (
        <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">Choose a supplier to see every product they supply.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span>
              {total.toLocaleString('en-IN')} matching product{total === 1 ? '' : 's'}
              {selected.size ? ` · ${selected.size} ticked` : ''}
            </span>
            {canEdit ? (
              <span className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selectable.length === 0}
                  onClick={() => setSelected((prev) => new Set([...prev, ...selectable.map((r) => r.id)]))}
                  className="min-h-8 rounded-lg border border-[#E2E8F0] px-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Tick this page
                </button>
                <button
                  type="button"
                  disabled={selected.size === 0 || pending}
                  onClick={() => run(() => addCatalogueProducts(campaignId, Array.from(selected)))}
                  className="min-h-8 rounded-lg bg-[#9C7A33] px-3 font-semibold text-white hover:bg-[#7C6224] disabled:opacity-50"
                >
                  Add ticked ({selected.size})
                </button>
                <button
                  type="button"
                  disabled={total === 0 || pending}
                  onClick={() => run(() => addCatalogueProductsByFilter(campaignId, filter))}
                  className="min-h-8 rounded-lg border border-[#9C7A33] px-3 font-semibold text-[#9C7A33] hover:bg-[#FBF8F2] disabled:opacity-50"
                >
                  {pending ? 'Adding…' : `Add all ${total.toLocaleString('en-IN')} matching`}
                </button>
              </span>
            ) : null}
          </div>
          <Feedback result={result} />

          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="w-8 p-2" />
                  <th className="p-2">Product</th>
                  <th className="p-2">Category</th>
                  {filter.mode === 'supplier' ? <th className="p-2">Supplier SKU</th> : null}
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2">Visibility</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      No products match these filters.
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => {
                  const added = already.has(row.id)
                  return (
                    <tr key={row.id} className={added ? 'bg-gray-50 text-gray-400' : ''}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          disabled={added || !canEdit}
                          checked={added || selected.has(row.id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (next.has(row.id)) next.delete(row.id)
                              else next.add(row.id)
                              return next
                            })
                          }
                          className="h-4 w-4 accent-[#9C7A33]"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded catalogue-studio-field">
                            <ProductImage src={row.image_url} alt={row.name} size="xs" className="absolute inset-0 h-full w-full" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{row.name}</p>
                            <p className="font-mono text-[10px] text-gray-500">
                              {row.sku}
                              {added ? ' · already in catalogue' : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-2">{row.category_name || '—'}</td>
                      {filter.mode === 'supplier' ? <td className="p-2 font-mono">{row.supplierSku || '—'}</td> : null}
                      <td className="p-2 text-right">{formatCurrency(row.price)}</td>
                      <td className="p-2">
                        {row.catalogue_access === 'none' ? (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Internal only</span>
                        ) : row.catalogue_access === 'selected' ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Selected companies</span>
                        ) : (
                          <span className="text-[10px] text-gray-500">All clients</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-xs">
              {page > 1 ? (
                <Link href={hrefWith({ page: String(page - 1) })} className="rounded-lg border px-3 py-1.5 font-semibold hover:bg-gray-50">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-gray-500">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={hrefWith({ page: String(page + 1) })} className="rounded-lg border px-3 py-1.5 font-semibold hover:bg-gray-50">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
