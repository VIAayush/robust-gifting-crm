'use client'

import { ProductImage } from '@/components/ui/product-image'
import { cn } from '@/lib/utils'

export type ColorOption = { id: string; colour: string; thumbnailUrl?: string | null }

/** Not rendered at all when a product has one or zero colours. */
export function ColorSelector({
  options,
  selectedId,
  onSelect,
}: {
  options: ColorOption[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (options.length <= 1) return null
  const selected = options.find((o) => o.id === selectedId) || options[0]

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B2430]">More colours</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {options.map((option) => {
          const isActive = option.id === selected?.id
          return (
            <button
              key={option.id}
              type="button"
              title={option.colour}
              aria-pressed={isActive}
              onClick={() => onSelect(option.id)}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  'block h-16 w-16 overflow-hidden rounded-md ring-1 ring-offset-2 transition-all sm:h-20 sm:w-20',
                  isActive
                    ? 'ring-2 ring-[#9C7A33] ring-offset-2'
                    : 'ring-[#E2E8F0] ring-offset-0 group-hover:ring-[#CBD5E1]',
                )}
              >
                <ProductImage src={option.thumbnailUrl} alt={option.colour} size="md" fit="cover" className="h-full w-full min-h-0" />
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  isActive ? 'text-[#9C7A33]' : 'text-[#5C6570] group-hover:text-[#1B2430]',
                )}
              >
                {option.colour}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
