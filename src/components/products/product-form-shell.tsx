'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { validateProductForm, type ProductFieldErrors } from '@/lib/products/validation'

type ActionResult = { error?: string; fieldErrors?: ProductFieldErrors; success?: boolean } | void

const FIELD_LABELS: Record<string, string> = {
  name: 'Product name',
  sku: 'SKU',
  category_id: 'Category',
  price: 'Selling price',
  mrp: 'MRP',
  moq: 'MOQ',
  supplier_cost: 'Supplier cost',
}

/**
 * Wraps a product create/edit form. The server action is called directly
 * (not as a native form action), so a validation error never reloads the page
 * or resets what was typed. Errors are listed at the top and the matching
 * inputs are marked aria-invalid (styled red in globals.css).
 */
export function ProductFormShell({
  action,
  creating,
  existing,
  className,
  successMessage = 'Saved.',
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  creating: boolean
  existing?: { price: number | null; mrp: number | null; sku?: string | null }
  className?: string
  successMessage?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({})
  const [saved, setSaved] = useState(false)

  const markFields = (errors: ProductFieldErrors) => {
    const form = formRef.current
    if (!form) return
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'))
    let first: HTMLElement | null = null
    for (const key of Object.keys(errors)) {
      const el = form.querySelector<HTMLElement>(`[name="${key}"]`)
      if (!el) continue
      el.setAttribute('aria-invalid', 'true')
      if (!first && el.getAttribute('type') !== 'hidden') first = el
    }
    first?.focus()
  }

  return (
    <form
      ref={formRef}
      noValidate
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const formData = new FormData(event.currentTarget)
        setSaved(false)
        const clientErrors = validateProductForm(formData, { creating, existing })
        if (Object.keys(clientErrors).length > 0) {
          setError('Please fix the highlighted fields.')
          setFieldErrors(clientErrors)
          markFields(clientErrors)
          return
        }
        setError(null)
        setFieldErrors({})
        markFields({})
        startTransition(async () => {
          try {
            const result = await action(formData)
            if (result && result.error) {
              setError(result.error)
              const errors = result.fieldErrors || {}
              setFieldErrors(errors)
              markFields(errors)
              return
            }
            setSaved(true)
            router.refresh()
          } catch (err) {
            // redirect() inside the action is delivered as a thrown navigation; let Next handle it.
            if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
              throw err
            }
            setError('Something went wrong while saving. Please try again.')
          }
        })
      }}
    >
      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p className="font-semibold">{error}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {Object.entries(fieldErrors).map(([key, message]) => (
                <li key={key}>
                  <span className="font-medium">{FIELD_LABELS[key] || key}:</span> {message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {saved && !creating ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          {successMessage}
        </p>
      ) : null}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending ? <p className="text-[11px] text-gray-500">Saving…</p> : null}
    </form>
  )
}
