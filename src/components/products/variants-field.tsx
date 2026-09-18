'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

type Row = { key: string; colour: string }

let counter = 0
function nextKey() {
  counter += 1
  return `v${Date.now()}${counter}`
}

/**
 * Repeatable colour-variant rows for the "Add product" form. Field names are
 * parallel arrays (`variant_colour`, `variant_key`, one entry per row) plus a
 * per-row keyed file input (`variant_photos_<key>`), so createProduct can read
 * them with plain FormData.getAll — no client-side submission logic needed.
 */
export function VariantsField() {
  const [rows, setRows] = useState<Row[]>([])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-700">Colour variants (optional)</label>
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { key: nextKey(), colour: '' }])}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9C7A33] hover:text-[#7C6224]"
        >
          <Plus size={12} /> Add colour
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        Only add these if this exact product comes in more than one colour. Each colour keeps this same SKU
        and gets its own photos.
      </p>

      {rows.map((row, i) => (
        <div key={row.key} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="variant_key" value={row.key} />
          <input
            name="variant_colour"
            required
            placeholder={`Colour ${i + 1}, e.g. Purple`}
            value={row.colour}
            onChange={(e) =>
              setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, colour: e.target.value } : r)))
            }
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#9C7A33] focus:outline-none"
          />
          <input
            type="file"
            name={`variant_photos_${row.key}`}
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="text-xs file:mr-2 file:px-2 file:py-1.5 file:rounded-md file:border file:border-gray-200 file:bg-white file:text-xs"
          />
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      ))}
    </div>
  )
}
