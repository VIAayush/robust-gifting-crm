import { formatCurrency } from '@/lib/utils'

/** Selling price with the MRP struck through and a discount badge, but only when MRP is genuinely higher. */
export function PriceDisplay({
  price,
  mrp,
  size = 'md',
  className = '',
}: {
  price: number | null | undefined
  mrp?: number | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const showMrp = mrp != null && price != null && mrp > price
  const off = showMrp ? Math.round(((mrp - price) / mrp) * 100) : 0
  const priceClass =
    size === 'lg' ? 'text-2xl sm:text-3xl' : size === 'sm' ? 'text-sm' : 'text-[15px]'

  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <span className={`${priceClass} font-semibold text-[#9C7A33]`}>{formatCurrency(price)}</span>
      {showMrp ? (
        <>
          <span className="text-xs text-[#8A94A3] line-through" aria-label={`MRP ${formatCurrency(mrp)}`}>
            {formatCurrency(mrp)}
          </span>
          {off > 0 ? <span className="text-[11px] font-semibold text-emerald-700">{off}% off</span> : null}
        </>
      ) : null}
    </p>
  )
}
