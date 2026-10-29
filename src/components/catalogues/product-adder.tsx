'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { addCatalogueProducts, addCatalogueProductsByFilter, selectCatalogueCandidateIds } from '@/app/crm/products/catalogues/actions'
import { Feedback } from '@/components/catalogues/catalogue-controls'
import { ProductImage } from '@/components/ui/product-image'
import { formatCurrency } from '@/lib/utils'
import type { CandidateFilter, CandidateRow } from '@/lib/catalogues/candidates'
import {
  clampRange,
  eligibleIds,
  hasValidPrice,
  offPageCount,
  pageSelectionState,
  parseStoredSelection,
  pruneSelection,
  rangeToParams,
  sanitisePriceRange,
  serialiseSelection,
  setMany,
  storageKey,
  toggleOne,
  togglePage,
} from '@/lib/catalogues/picker-state'

type Option = { id: string; name: string }
type Bounds = { min: number; max: number } | null

const RANGE_CSS = `
.rg-range{position:absolute;left:0;top:0;width:100%;height:24px;margin:0;background:transparent;pointer-events:none;-webkit-appearance:none;appearance:none}
.rg-range::-webkit-slider-runnable-track{background:transparent;height:24px}
.rg-range::-moz-range-track{background:transparent;height:24px}
.rg-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;pointer-events:auto;width:24px;height:24px;border-radius:9999px;background:#9C7A33;border:2px solid #fff;box-shadow:0 0 0 1px #9C7A33;cursor:grab}
.rg-range::-moz-range-thumb{pointer-events:auto;width:20px;height:20px;border-radius:9999px;background:#9C7A33;border:2px solid #fff;box-shadow:0 0 0 1px #9C7A33;cursor:grab}
.rg-range:focus-visible::-webkit-slider-thumb{outline:2px solid #1d4ed8;outline-offset:2px}
.rg-range:focus-visible::-moz-range-thumb{outline:2px solid #1d4ed8;outline-offset:2px}
.rg-range:disabled::-webkit-slider-thumb{background:#cbd5e1;box-shadow:0 0 0 1px #cbd5e1;cursor:not-allowed}
.rg-range:disabled::-moz-range-thumb{background:#cbd5e1;box-shadow:0 0 0 1px #cbd5e1;cursor:not-allowed}
`

/** Dual-thumb price range from two native range inputs plus numeric inputs. Emits hidden min/max fields for the filter form. */
function PriceRange({
  bounds,
  initialMin,
  initialMax,
  onCommit,
}: {
  bounds: NonNullable<Bounds>
  initialMin: string | undefined
  initialMax: string | undefined
  onCommit: (params: { min?: string; max?: string }) => void
}) {
  const floor = Math.floor(bounds.min)
  const ceil = Math.ceil(bounds.max)
  const fixed = floor >= ceil
  const start = sanitisePriceRange(initialMin, initialMax)
  const [range, setRange] = useState(() => clampRange(start.min ?? floor, start.max ?? ceil, floor, ceil))
  const [draft, setDraft] = useState<{ min?: string; max?: string }>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const apply = (next: { min: number; max: number }, immediate = false) => {
    setRange(next)
    setDraft({})
    if (timer.current) clearTimeout(timer.current)
    const push = () => onCommit(rangeToParams(next.min, next.max, floor, ceil))
    if (immediate) push()
    else timer.current = setTimeout(push, 500)
  }

  const span = Math.max(1, ceil - floor)
  const pct = (v: number) => ((v - floor) / span) * 100
  const filtered = range.min > floor || range.max < ceil
  const params = rangeToParams(range.min, range.max, floor, ceil)
  const commitDraft = (which: 'min' | 'max') => {
    const text = draft[which]
    if (text === undefined) return
    const typed = text.trim() === '' ? (which === 'min' ? floor : ceil) : Number(text)
    apply(clampRange(which === 'min' ? typed : range.min, which === 'max' ? typed : range.max, floor, ceil, which))
  }
  const num = 'min-h-9 w-24 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm disabled:bg-gray-50 disabled:text-gray-400'

  return (
    <fieldset className="min-w-[16rem] flex-1 basis-full rounded-lg border border-[#E2E8F0] p-3 sm:basis-[22rem]">
      <legend className="px-1 text-xs font-medium text-gray-600">Price range</legend>
      <style>{RANGE_CSS}</style>
      {params.min ? <input type="hidden" name="min" value={params.min} /> : null}
      {params.max ? <input type="hidden" name="max" value={params.max} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700">
        <span aria-live="polite" className="font-semibold">
          {fixed ? `All priced at ${formatCurrency(floor)}` : `${formatCurrency(range.min)} to ${formatCurrency(range.max)}`}
        </span>
        <span className="text-gray-500">
          Available {formatCurrency(floor)}
          {fixed ? '' : ` to ${formatCurrency(ceil)}`}
        </span>
      </div>
      <div className="relative mx-3 my-2 h-6">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded bg-gray-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-[#9C7A33]/70"
          style={{ left: `${fixed ? 0 : pct(range.min)}%`, right: `${fixed ? 0 : 100 - pct(range.max)}%` }}
        />
        <input
          type="range"
          className="rg-range"
          aria-label="Minimum price"
          min={floor}
          max={ceil}
          step={1}
          value={range.min}
          disabled={fixed}
          style={{ zIndex: range.min > floor + span / 2 ? 3 : 2 }}
          onChange={(e) => apply(clampRange(Number(e.target.value), range.max, floor, ceil, 'min'))}
        />
        <input
          type="range"
          className="rg-range"
          aria-label="Maximum price"
          min={floor}
          max={ceil}
          step={1}
          value={range.max}
          disabled={fixed}
          style={{ zIndex: range.min > floor + span / 2 ? 2 : 3 }}
          onChange={(e) => apply(clampRange(range.min, Number(e.target.value), floor, ceil, 'max'))}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-gray-600">
          Min ₹
          <input
            type="number"
            inputMode="numeric"
            min={floor}
            max={ceil}
            disabled={fixed}
            value={draft.min ?? String(range.min)}
            onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))}
            onBlur={() => commitDraft('min')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft('min') } }}
            className={`${num} mt-1 block`}
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Max ₹
          <input
            type="number"
            inputMode="numeric"
            min={floor}
            max={ceil}
            disabled={fixed}
            value={draft.max ?? String(range.max)}
            onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
            onBlur={() => commitDraft('max')}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft('max') } }}
            className={`${num} mt-1 block`}
          />
        </label>
        <button
          type="button"
          disabled={!filtered && !initialMin && !initialMax}
          onClick={() => apply({ min: floor, max: ceil }, true)}
          className="min-h-9 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Reset price
        </button>
      </div>
    </fieldset>
  )
}

export function ProductAdder({
  campaignId,
  basePath,
  filter,
  rows,
  total,
  page,
  pageSize,
  priceBounds,
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
  priceBounds: Bounds
  inCatalogue: string[]
  categories: Option[]
  suppliers: Option[]
  canEdit: boolean
  loadError?: string
}) {
  const router = useRouter()
  const [stored, setStored] = useState<ReadonlySet<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const already = useMemo(() => new Set(inCatalogue), [inCatalogue])
  // Selection is by id and independent of the visible list; ids already in the catalogue are dropped.
  const selected = useMemo(() => pruneSelection(stored, already), [stored, already])
  const pageIds = useMemo(() => eligibleIds(rows, already, canEdit), [rows, already, canEdit])
  const pageState = pageSelectionState(pageIds, selected)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const headerBox = useRef<HTMLInputElement>(null)
  const key = storageKey(campaignId)
  const offPage = offPageCount(selected, rows.map((r) => r.id))
  const priceActive = sanitisePriceRange(filter.minPrice, filter.maxPrice)

  // Restore the selection kept for this catalogue (survives filter changes, tab changes and page changes).
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = window.sessionStorage.getItem(key)
    } catch {
      raw = null
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from sessionStorage (external system) after hydration
    setStored(parseStoredSelection(raw, new Set()))
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      if (selected.size) window.sessionStorage.setItem(key, serialiseSelection(selected))
      else window.sessionStorage.removeItem(key)
    } catch {
      // storage unavailable (private mode, blocked): the selection still works in memory
    }
  }, [selected, hydrated, key])

  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = pageState === 'some'
  }, [pageState])

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
    for (const [k, value] of Object.entries(merged)) if (value) params.set(k, value)
    if (params.get('page') === '1') params.delete('page')
    return `${basePath}?${params.toString()}#add-products`
  }

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const params = new URLSearchParams()
    for (const name of ['tab', 'supplier', 'q', 'category', 'min', 'max']) {
      const value = String(data.get(name) || '').trim()
      if (value) params.set(name, value)
    }
    router.push(`${basePath}?${params.toString()}#add-products`, { scroll: false })
  }

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => {
    setResult(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setResult({ ok: false, text: res.error })
      else {
        setResult({ ok: true, text: res.message || 'Added.' })
        setStored(new Set())
        router.refresh()
      }
    })
  }

  const selectAllMatching = () => {
    setResult(null)
    startTransition(async () => {
      const res = await selectCatalogueCandidateIds(campaignId, filter)
      if (res.error || !res.ids) {
        setResult({ ok: false, text: res.error || 'Could not select the matching products.' })
        return
      }
      const ids = res.ids
      setStored((prev) => setMany(prev, ids, true))
      setResult({ ok: true, text: ids.length ? `Selected ${ids.length.toLocaleString('en-IN')} product${ids.length === 1 ? '' : 's'} across all pages.` : 'No eligible products match (all are already added or have no price).' })
    })
  }

  const field = 'min-h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm'
  const showPrice = filter.mode === 'search' || Boolean(filter.supplierId)
  const priceKey = `${filter.mode}|${filter.supplierId}|${filter.categoryId}|${filter.q}|${priceBounds?.min}|${priceBounds?.max}|${filter.minPrice}|${filter.maxPrice}`
  const btn = 'min-h-9 rounded-lg border border-[#E2E8F0] px-3 font-semibold hover:bg-gray-50 disabled:opacity-50'

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

      <form method="get" action={basePath} onSubmit={submitFilters} className="flex flex-wrap items-end gap-2">
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
        <button type="submit" className="min-h-9 rounded-lg border border-[#E2E8F0] bg-gray-50 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100">
          Filter
        </button>
        {showPrice ? (
          priceBounds ? (
            <PriceRange
              key={priceKey}
              bounds={priceBounds}
              initialMin={filter.minPrice}
              initialMax={filter.maxPrice}
              onCommit={(p) => router.push(hrefWith({ min: p.min, max: p.max, page: '1' }), { scroll: false })}
            />
          ) : (
            <p className="basis-full rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
              No products with a price match the supplier, category and search above, so there is no price range to filter.
            </p>
          )
        ) : null}
      </form>

      {loadError ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">Could not load products: {loadError}</p> : null}

      {filter.mode === 'supplier' && !filter.supplierId ? (
        <p className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">Choose a supplier to see every product they supply.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span aria-live="polite">
              {total.toLocaleString('en-IN')} matching product{total === 1 ? '' : 's'}
              {' · '}
              <strong className="text-gray-900">{selected.size.toLocaleString('en-IN')} selected</strong>
              {offPage > 0 ? ` (${offPage.toLocaleString('en-IN')} on other pages or hidden by the current filters)` : ''}
            </span>
            {canEdit ? (
              <span className="flex flex-wrap gap-2">
                <button type="button" disabled={total === 0 || pending} onClick={selectAllMatching} className={btn}>
                  Select all {total.toLocaleString('en-IN')} matching
                </button>
                <button type="button" disabled={selected.size === 0 || pending} onClick={() => setStored(new Set())} className={btn}>
                  Deselect all
                </button>
                <button
                  type="button"
                  disabled={selected.size === 0 || pending}
                  onClick={() => run(() => addCatalogueProducts(campaignId, Array.from(selected)))}
                  className="min-h-9 rounded-lg bg-[#9C7A33] px-3 font-semibold text-white hover:bg-[#7C6224] disabled:opacity-50"
                >
                  Add ticked ({selected.size})
                </button>
                <button
                  type="button"
                  disabled={total === 0 || pending}
                  onClick={() => run(() => addCatalogueProductsByFilter(campaignId, filter))}
                  className="min-h-9 rounded-lg border border-[#9C7A33] px-3 font-semibold text-[#9C7A33] hover:bg-[#FBF8F2] disabled:opacity-50"
                >
                  {pending ? 'Working…' : `Add all ${total.toLocaleString('en-IN')} matching`}
                </button>
              </span>
            ) : null}
          </div>
          <Feedback result={result} />

          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="w-10 p-2">
                    <input
                      ref={headerBox}
                      type="checkbox"
                      aria-label="Select all eligible products on this page"
                      disabled={!canEdit || pageIds.length === 0}
                      checked={pageState === 'all'}
                      onChange={() => setStored((prev) => togglePage(prev, pageIds))}
                      className="h-5 w-5 accent-[#9C7A33]"
                    />
                  </th>
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
                    <td colSpan={filter.mode === 'supplier' ? 6 : 5} className="p-6 text-center text-gray-500">
                      {priceActive.min !== null || priceActive.max !== null ? 'No products in this price range.' : 'No products match these filters.'}
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => {
                  const added = already.has(row.id)
                  const priced = hasValidPrice(row.price)
                  return (
                    <tr key={row.id} className={added || !priced ? 'bg-gray-50 text-gray-400' : ''}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}${added ? ' (already in catalogue)' : !priced ? ' (no price)' : ''}`}
                          disabled={added || !priced || !canEdit}
                          checked={added || selected.has(row.id)}
                          onChange={() => setStored((prev) => toggleOne(prev, row.id))}
                          className="h-5 w-5 accent-[#9C7A33]"
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
                      <td className="p-2 text-right">
                        {priced ? formatCurrency(row.price) : <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">No price</span>}
                      </td>
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
