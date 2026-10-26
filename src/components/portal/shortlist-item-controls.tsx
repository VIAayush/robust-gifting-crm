'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importBrowserShortlist, removeFromShortlist, updateShortlistItem } from '@/app/portal/shortlist/actions'

export function ShortlistQuantity({ id, quantity, editable }: { id: string; quantity: number; editable: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(String(quantity))
  const [saved, setSaved] = useState(String(quantity))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = () => {
    if (value === saved) return
    setError(null)
    const formData = new FormData()
    formData.set('id', id)
    formData.set('quantity', value)
    startTransition(async () => {
      const result = await updateShortlistItem(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(value)
      router.refresh()
    })
  }

  if (!editable) {
    return <p className="text-sm text-gray-700">Qty {quantity.toLocaleString('en-IN')}</p>
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Quantity
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100000}
          step={1}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
          className="min-h-9 w-24 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm outline-none focus:border-[#9C7A33]"
        />
        {pending ? <span className="text-[11px] text-gray-400">Saving…</span> : null}
      </label>
      {error ? (
        <p role="alert" className="text-[11px] text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function RemoveShortlistItem({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          const formData = new FormData()
          formData.set('id', id)
          startTransition(async () => {
            const result = await removeFromShortlist(formData)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }}
        className="inline-flex min-h-8 w-full items-center justify-center text-[11px] font-medium text-gray-500 hover:text-red-600 disabled:opacity-60"
      >
        {pending ? 'Removing…' : 'Remove from shortlist'}
      </button>
      {error ? (
        <p role="alert" className="text-center text-[11px] text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const LEGACY_KEY = 'giffter_shortlist'

/** Moves anything saved in the old browser-only shortlist into the shared one, once. */
export function BrowserShortlistImporter() {
  const router = useRouter()
  const ran = useRef(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    let items: { id?: string; sku?: string }[] = []
    try {
      const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')
      if (Array.isArray(raw)) items = raw.filter((i) => i && typeof i === 'object')
    } catch {
      items = []
    }
    if (items.length === 0) return
    void importBrowserShortlist(items).then((result) => {
      if (result.error) {
        setMessage(result.error)
        return
      }
      try {
        localStorage.removeItem(LEGACY_KEY)
      } catch {
        // storage unavailable; harmless, the import is idempotent
      }
      if (result.added) {
        setMessage(`We moved ${result.added} item${result.added === 1 ? '' : 's'} you saved earlier into your shortlist.`)
        router.refresh()
      }
    })
  }, [router])

  if (!message) return null
  return <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>
}
