'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export type PickerProduct = { id: string; name: string; sku: string; meta?: string }

const MAX_RESULTS = 60

/**
 * Searchable product picker (name or SKU). Holds the selection in a hidden
 * input so it works inside plain <form>s, and searches the whole list in
 * memory, so nothing is cut off the way a long <select> was.
 */
export function ProductPicker({
  name,
  products,
  label = 'Product',
  placeholder = 'Search by product name or SKU',
  required = false,
  defaultValue = '',
  onChange,
  className = '',
}: {
  name?: string
  products: PickerProduct[]
  label?: string
  placeholder?: string
  required?: boolean
  defaultValue?: string
  onChange?: (product: PickerProduct | null) => void
  className?: string
}) {
  const listId = useId()
  const [selectedId, setSelectedId] = useState(defaultValue)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(() => products.find((p) => p.id === selectedId) || null, [products, selectedId])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = needle
      ? products.filter((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
      : products
    return list.slice(0, MAX_RESULTS)
  }, [products, query])
  const totalMatches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return products.length
    return products.filter((p) => p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle)).length
  }, [products, query])

  const choose = (product: PickerProduct | null) => {
    setSelectedId(product?.id || '')
    setQuery('')
    setOpen(false)
    onChange?.(product)
  }

  return (
    <div className={`relative w-full min-w-0 ${className}`}>
      {name ? <input type="hidden" name={name} value={selectedId} /> : null}
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4A5568]">
        {label}
        {required ? ' *' : ''}
      </label>
      {selected && !open ? (
        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => {
              setOpen(true)
              requestAnimationFrame(() => inputRef.current?.focus())
            }}
          >
            <span className="font-medium text-gray-900">{selected.name}</span>
            <span className="ml-2 font-mono text-xs text-gray-500">{selected.sku}</span>
          </button>
          <button type="button" aria-label="Clear product" onClick={() => choose(null)} className="text-gray-400 hover:text-gray-700">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-required={required}
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, matches.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                if (open && matches[active]) {
                  e.preventDefault()
                  choose(matches[active])
                }
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#9C7A33]"
          />
        </div>
      )}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No products match &ldquo;{query}&rdquo;.</li>
          ) : (
            matches.map((product, index) => (
              <li
                key={product.id}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(product)
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 text-sm ${index === active ? 'bg-[#F5F7FA]' : ''}`}
              >
                <span className="font-medium text-gray-900">{product.name}</span>
                <span className="ml-2 font-mono text-xs text-gray-500">{product.sku}</span>
                {product.meta ? <span className="ml-2 text-xs text-gray-400">{product.meta}</span> : null}
              </li>
            ))
          )}
          {totalMatches > matches.length ? (
            <li className="border-t px-3 py-2 text-[11px] text-gray-500">
              Showing {matches.length} of {totalMatches.toLocaleString('en-IN')}. Keep typing to narrow it down.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
