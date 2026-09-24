'use client'

import { useFormStatus } from 'react-dom'
import { Star } from 'lucide-react'
import { toggleCompanyInterestForm } from '@/app/portal/interest/actions'
import { useProductDetail } from '@/components/site/product-detail-view'

function ActionButton({ interested, variant }: { interested: boolean; variant: 'card' | 'detail' }) {
  const { pending } = useFormStatus()
  const className =
    variant === 'detail'
      ? `inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
          interested ? 'border border-green-200 bg-green-50 text-green-800' : 'bg-[#9C7A33] text-white hover:bg-[#7C6224]'
        }`
      : `inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
          interested
            ? 'border border-green-200 bg-green-50 text-green-800'
            : 'border border-[#E2E8F0] bg-white text-[#9C7A33] hover:bg-[#F5F7FA]'
        }`
  return (
    <button type="submit" disabled={pending} className={className} aria-pressed={interested}>
      <Star size={14} className={interested ? 'fill-current' : ''} />
      {pending ? 'Saving…' : interested ? 'Interested' : 'Add to Interest'}
    </button>
  )
}

/**
 * Persistent (DB-backed) "Add to Interest" toggle for the general company
 * catalogue — distinct from the campaign-scoped Shortlist/Select buttons in
 * OfferingActions, and from the localStorage-only CatalogueShortlistButton
 * this is meant to replace for the B2B Interest List requirement.
 */
export function ProductInterestButton({
  productId,
  variantId,
  interested,
  variant = 'card',
}: {
  productId: string
  variantId?: string | null
  interested: boolean
  variant?: 'card' | 'detail'
}) {
  return (
    <form action={toggleCompanyInterestForm}>
      <input type="hidden" name="product_id" value={productId} />
      {variantId ? <input type="hidden" name="variant_id" value={variantId} /> : null}
      {interested ? <input type="hidden" name="remove" value="1" /> : null}
      <ActionButton interested={interested} variant={variant} />
    </form>
  )
}

/**
 * Variant-aware version for the product detail page: reads the colour
 * currently picked in ColorSelectorSlot (shared ProductDetailProvider
 * context) so the Interest List preserves whichever variant the shopper
 * actually selected, matching the B2B "variant must be preserved" spec.
 */
export function InterestButtonSlot({
  productId,
  interestedVariantIds,
  interestedNoVariant,
}: {
  productId: string
  interestedVariantIds: string[]
  interestedNoVariant: boolean
}) {
  const { variants, selectedId } = useProductDetail()
  const selected = variants.find((v) => v.id === selectedId) || variants[0] || null
  const variantId = selected?.id ?? null
  const interested = variantId ? interestedVariantIds.includes(variantId) : interestedNoVariant

  return <ProductInterestButton productId={productId} variantId={variantId} interested={interested} variant="detail" />
}
