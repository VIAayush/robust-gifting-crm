'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { addToShortlist, removeFromShortlist } from '@/app/portal/shortlist/actions'
import { useProductDetail } from '@/components/site/product-detail-view'

type Variant = 'card' | 'detail'

export function ShortlistButton({
  productId,
  variantId = null,
  shortlisted,
  variant = 'card',
  sourceOfferingId = null,
}: {
  productId: string
  variantId?: string | null
  shortlisted: boolean
  variant?: Variant
  /** Catalogue offering this was added from, so staff can see the catalogue context. */
  sourceOfferingId?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState(shortlisted)
  const [syncedFrom, setSyncedFrom] = useState(shortlisted)
  const [error, setError] = useState<string | null>(null)

  // Server re-renders (another tab, a removal on the shortlist page) win over local state.
  if (shortlisted !== syncedFrom) {
    setSyncedFrom(shortlisted)
    setActive(shortlisted)
  }

  const toggle = () => {
    setError(null)
    const formData = new FormData()
    formData.set('product_id', productId)
    if (variantId) formData.set('variant_id', variantId)
    if (sourceOfferingId) formData.set('source_offering_id', sourceOfferingId)
    const wasActive = active
    setActive(!wasActive)
    startTransition(async () => {
      const result = wasActive ? await removeFromShortlist(formData) : await addToShortlist(formData)
      if (result.error) {
        setActive(wasActive)
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const base =
    variant === 'detail'
      ? 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60'
      : 'inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60'
  const tone = active
    ? 'border border-green-200 bg-green-50 text-green-800 hover:bg-green-100'
    : variant === 'detail'
      ? 'bg-[#9C7A33] text-white hover:bg-[#7C6224]'
      : 'border border-[#E2E8F0] bg-white text-[#9C7A33] hover:bg-[#F5F7FA]'

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={toggle} disabled={pending} aria-pressed={active} className={`${base} ${tone}`}>
        <Heart size={14} className={active ? 'fill-current' : ''} />
        {pending ? 'Saving…' : active ? 'Shortlisted' : 'Add to Shortlist'}
      </button>
      {active && !pending && variant === 'detail' ? (
        <p className="text-center text-xs text-gray-500">
          Saved.{' '}
          <Link href="/portal/shortlist" className="font-semibold text-[#9C7A33] hover:underline">
            View shortlist
          </Link>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Product page version: follows the colour picked in the shared ProductDetailProvider. */
export function ShortlistButtonSlot({
  productId,
  shortlistedVariantIds,
  shortlistedNoVariant,
}: {
  productId: string
  shortlistedVariantIds: string[]
  shortlistedNoVariant: boolean
}) {
  const { variants, selectedId } = useProductDetail()
  const selected = variants.find((v) => v.id === selectedId) || variants[0] || null
  const variantId = selected?.id ?? null
  const shortlisted = variantId ? shortlistedVariantIds.includes(variantId) : shortlistedNoVariant
  return <ShortlistButton key={variantId || 'none'} productId={productId} variantId={variantId} shortlisted={shortlisted} variant="detail" />
}
