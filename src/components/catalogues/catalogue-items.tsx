'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { removeCatalogueItems, updateCatalogueItem } from '@/app/crm/products/catalogues/actions'
import { Feedback } from '@/components/catalogues/catalogue-controls'
import { ProductImage } from '@/components/ui/product-image'
import type { VisibilityIssue } from '@/lib/catalogues/visibility'

export type CatalogueItem = {
  id: string
  productId: string
  name: string
  sku: string
  image_url: string | null
  selling_price: number
  moq: number
  listPrice: number | null
  issues: VisibilityIssue[]
}

function ItemRow({ item, campaignId, canEdit, checked, onCheck }: { item: CatalogueItem; campaignId: string; canEdit: boolean; checked: boolean; onCheck: () => void }) {
  const router = useRouter()
  const [price, setPrice] = useState(String(item.selling_price))
  const [moq, setMoq] = useState(String(item.moq))
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = price !== String(item.selling_price) || moq !== String(item.moq)

  return (
    <tr className="align-top">
      <td className="p-2">
        {canEdit ? <input type="checkbox" aria-label={`Select ${item.name}`} checked={checked} onChange={onCheck} className="h-4 w-4 accent-[#9C7A33]" /> : null}
      </td>
      <td className="p-2">
        <div className="flex items-start gap-2">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded catalogue-studio-field">
            <ProductImage src={item.image_url} alt={item.name} size="xs" className="absolute inset-0 h-full w-full" />
          </div>
          <div className="min-w-0">
            <Link href={`/crm/products/${item.productId}`} className="font-medium text-gray-900 hover:text-[#9C7A33]">
              {item.name}
            </Link>
            <p className="font-mono text-[10px] text-gray-500">{item.sku}</p>
            {item.issues.map((issue) => (
              <p key={issue.kind} className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {issue.message}
              </p>
            ))}
          </div>
        </div>
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          step="0.01"
          aria-label={`Catalogue price for ${item.name}`}
          value={price}
          disabled={!canEdit}
          onChange={(e) => setPrice(e.target.value)}
          className="min-h-8 w-24 rounded border border-[#E2E8F0] px-2 text-xs"
        />
        {item.listPrice != null && Number(item.listPrice) !== Number(item.selling_price) ? (
          <p className="mt-0.5 text-[10px] text-gray-400">List ₹{item.listPrice}</p>
        ) : null}
      </td>
      <td className="p-2">
        <input
          type="number"
          min={1}
          step={1}
          aria-label={`MOQ for ${item.name}`}
          value={moq}
          disabled={!canEdit}
          onChange={(e) => setMoq(e.target.value)}
          className="min-h-8 w-20 rounded border border-[#E2E8F0] px-2 text-xs"
        />
      </td>
      <td className="p-2">
        {canEdit ? (
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={() => {
              const fd = new FormData()
              fd.set('id', item.id)
              fd.set('campaign_id', campaignId)
              fd.set('selling_price', price)
              fd.set('moq', moq)
              setResult(null)
              startTransition(async () => {
                const res = await updateCatalogueItem(fd)
                if (res.error) setResult({ ok: false, text: res.error })
                else {
                  setResult({ ok: true, text: 'Saved' })
                  router.refresh()
                }
              })
            }}
            className="min-h-8 rounded-lg border border-[#E2E8F0] px-3 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        ) : null}
        <Feedback result={result} />
      </td>
    </tr>
  )
}

export function CatalogueItems({ campaignId, items, canEdit }: { campaignId: string; items: CatalogueItem[]; canEdit: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const issueCount = items.filter((i) => i.issues.length > 0).length

  if (items.length === 0) {
    return <p className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">No products yet. Add some below.</p>
  }

  return (
    <div className="space-y-3">
      {issueCount > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {issueCount} product{issueCount === 1 ? '' : 's'} won&apos;t be shown to some or all assigned clients (see the notes under each). Clients
          only ever see products their company is allowed to see.
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setSelected(new Set(items.map((i) => i.id)))} className="min-h-8 rounded-lg border px-3 font-semibold hover:bg-gray-50">
            Select all ({items.length})
          </button>
          {selected.size ? (
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-8 rounded-lg border px-3 font-semibold hover:bg-gray-50">
              Clear
            </button>
          ) : null}
          {confirming ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
              Remove {selected.size} from this catalogue? (Products themselves are not deleted.)
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  setResult(null)
                  startTransition(async () => {
                    const res = await removeCatalogueItems(campaignId, Array.from(selected))
                    if (res.error) setResult({ ok: false, text: res.error })
                    else {
                      setResult({ ok: true, text: res.message || 'Removed.' })
                      setSelected(new Set())
                      router.refresh()
                    }
                  })
                }}
                className="rounded bg-red-600 px-2 py-1 font-semibold text-white"
              >
                Remove
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded border bg-white px-2 py-1">
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={selected.size === 0 || pending}
              onClick={() => setConfirming(true)}
              className="min-h-8 rounded-lg border border-red-200 px-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              {pending ? 'Removing…' : `Remove selected (${selected.size})`}
            </button>
          )}
          <Feedback result={result} />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2">Product</th>
              <th className="p-2">Catalogue price (₹)</th>
              <th className="p-2">MOQ</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                campaignId={campaignId}
                canEdit={canEdit}
                checked={selected.has(item.id)}
                onCheck={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(item.id)) next.delete(item.id)
                    else next.add(item.id)
                    return next
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
