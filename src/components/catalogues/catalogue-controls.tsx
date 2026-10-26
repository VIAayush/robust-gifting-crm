'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Result = { error?: string; success?: boolean; message?: string } | void

function isRedirect(err: unknown) {
  return Boolean(err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT'))
}

export function Feedback({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`text-xs ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
      {result.text}
    </p>
  )
}

/** A button that runs a server action and always shows what happened. */
export function ActionButton({
  action,
  fields,
  children,
  confirm,
  tone = 'default',
  className = '',
}: {
  action: (formData: FormData) => Promise<Result>
  fields: Record<string, string>
  children: React.ReactNode
  confirm?: string
  tone?: 'default' | 'primary' | 'danger'
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const run = () => {
    setAsking(false)
    setResult(null)
    const formData = new FormData()
    for (const [key, value] of Object.entries(fields)) formData.set(key, value)
    startTransition(async () => {
      try {
        const res = await action(formData)
        if (res && res.error) setResult({ ok: false, text: res.error })
        else {
          if (res && res.message) setResult({ ok: true, text: res.message })
          router.refresh()
        }
      } catch (err) {
        if (isRedirect(err)) throw err
        setResult({ ok: false, text: 'Something went wrong. Please try again.' })
      }
    })
  }

  const toneClass =
    tone === 'primary'
      ? 'bg-[#9C7A33] text-white hover:bg-[#7C6224] border-transparent'
      : tone === 'danger'
        ? 'border-red-200 text-red-700 hover:bg-red-50'
        : 'border-[#E2E8F0] text-gray-700 hover:bg-gray-50'

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      {asking ? (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {confirm}
          <button type="button" onClick={run} className="rounded bg-red-600 px-2 py-1 font-semibold text-white">
            Yes
          </button>
          <button type="button" onClick={() => setAsking(false)} className="rounded border border-gray-300 bg-white px-2 py-1">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => (confirm ? setAsking(true) : run())}
          className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-semibold disabled:opacity-60 ${toneClass}`}
        >
          {pending ? 'Working…' : children}
        </button>
      )}
      <Feedback result={result} />
    </span>
  )
}

/** Create or edit catalogue details (name, occasion, description, budget per person). */
export function CatalogueDetailsForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<Result>
  initial?: { id?: string; name?: string; occasion?: string | null; description?: string | null; budget_per_employee?: number | null }
  submitLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const input = 'min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm'

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const formData = new FormData(event.currentTarget)
        if (!String(formData.get('name') || '').trim()) {
          setResult({ ok: false, text: 'Give the catalogue a name.' })
          return
        }
        setResult(null)
        startTransition(async () => {
          try {
            const res = await action(formData)
            if (res && res.error) setResult({ ok: false, text: res.error })
            else {
              if (res && res.message) setResult({ ok: true, text: res.message })
              router.refresh()
            }
          } catch (err) {
            if (isRedirect(err)) throw err
            setResult({ ok: false, text: 'Something went wrong. Please try again.' })
          }
        })
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label className="text-xs font-medium text-gray-600 sm:col-span-2">
        Catalogue name *
        <input name="name" defaultValue={initial?.name || ''} maxLength={120} className={`${input} mt-1`} placeholder="e.g. Diwali 2026 hampers" />
      </label>
      <label className="text-xs font-medium text-gray-600">
        Occasion (optional)
        <input name="occasion" defaultValue={initial?.occasion || ''} maxLength={120} className={`${input} mt-1`} placeholder="e.g. Diwali" />
      </label>
      <label className="text-xs font-medium text-gray-600">
        Budget per person, ₹ (optional)
        <input
          name="budget_per_employee"
          type="number"
          min={0}
          step="0.01"
          defaultValue={initial?.budget_per_employee ? String(initial.budget_per_employee) : ''}
          className={`${input} mt-1`}
        />
      </label>
      <label className="text-xs font-medium text-gray-600 sm:col-span-2">
        Description (optional, shown to clients)
        <textarea name="description" defaultValue={initial?.description || ''} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        <Feedback result={result} />
      </div>
    </form>
  )
}
