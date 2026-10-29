'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortalRequirement, type PortalRequirementInput } from '@/app/portal/actions'
import { MobileSheetSelect, SheetDateField } from '@/components/ui/mobile-filter-sheet'
import { MAX_CUSTOM_PURPOSE_LENGTH, OTHER_PURPOSE, PURPOSE_OPTIONS } from '@/lib/requirements/purpose'

export type WizardItem = {
  key: string
  product_id: string
  variant_id: string | null
  name: string
  sku: string
  colour: string | null
  quantity: number
  notes?: string
}

type Fields = Omit<PortalRequirementInput, 'items'>
type FieldErrors = Partial<Record<keyof PortalRequirementInput | 'items', string>>

const DRAFT_KEY = 'giffter.portal.requirement-draft'
const EMPTY: Fields = {
  name: '',
  purpose: '',
  custom_purpose: '',
  description: '',
  budget_per_unit: '',
  quantity: '',
  deadline: '',
  delivery_city: '',
}

const STEP_FIELDS: Record<number, (keyof Fields)[]> = {
  1: ['name', 'purpose', 'custom_purpose', 'description'],
  2: ['budget_per_unit', 'quantity', 'deadline', 'delivery_city'],
}

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function validateStep(step: number, f: Fields): FieldErrors {
  const errors: FieldErrors = {}
  if (step === 1) {
    if (!f.name.trim()) errors.name = 'Give this requirement a name.'
    else if (f.name.trim().length > 120) errors.name = 'Keep the name under 120 characters.'
    if (!f.purpose) errors.purpose = 'Select a purpose / occasion.'
    if (f.purpose === OTHER_PURPOSE) {
      if (!f.custom_purpose.trim()) errors.custom_purpose = 'Type the purpose / occasion.'
      else if (f.custom_purpose.trim().length > MAX_CUSTOM_PURPOSE_LENGTH) {
        errors.custom_purpose = `Keep it under ${MAX_CUSTOM_PURPOSE_LENGTH} characters.`
      }
    }
    if (f.description.length > 2000) errors.description = 'Keep the description under 2,000 characters.'
  }
  if (step === 2) {
    if (f.budget_per_unit.trim()) {
      const b = Number(f.budget_per_unit)
      if (!Number.isFinite(b) || b <= 0) errors.budget_per_unit = 'Budget must be more than ₹0.'
    }
    if (f.quantity.trim()) {
      const q = Number(f.quantity)
      if (!Number.isInteger(q) || q < 1) errors.quantity = 'Quantity must be a whole number of at least 1.'
    }
    if (!f.deadline) errors.deadline = 'Choose a required-by date.'
    else if (f.deadline < todayLocal()) errors.deadline = 'The required-by date cannot be in the past.'
    if (f.delivery_city.trim().length < 2) errors.delivery_city = 'Enter the delivery city.'
  }
  return errors
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  )
}

const inputClass = (hasError: boolean) =>
  `min-h-11 w-full rounded-lg border bg-white px-3 py-2 outline-none focus:ring-1 ${
    hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-[#E2E8F0] focus:border-[#9C7A33] focus:ring-[#9C7A33]'
  }`

export function RequirementWizard({ shortlist, initialName, initialQuantity }: { shortlist: WizardItem[]; initialName?: string; initialQuantity?: string }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [fields, setFields] = useState<Fields>(() => (initialName ? { ...EMPTY, name: initialName, quantity: initialQuantity || '' } : EMPTY))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  // One key per wizard session: a retry after a network error reuses it, so the server returns the same requirement.
  const [submissionKey] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`))
  const restored = useRef(false)

  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(shortlist.map((item) => [item.key, true])),
  )
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(shortlist.map((item) => [item.key, String(item.quantity || 1)])),
  )
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(shortlist.map((item) => [item.key, item.notes || ''])),
  )

  // Keep what the client typed if they refresh mid-way.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
      // A fresh "Request quotation" from a catalogue starts clean instead of reviving an old draft.
      if (saved && typeof saved === 'object' && !initialName) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from sessionStorage after mount
        setFields({ ...EMPTY, ...saved.fields })
        if (typeof saved.step === 'number' && saved.step >= 1 && saved.step <= 3) setStep(saved.step)
      }
    } catch {
      // ignore an unreadable draft
    }
  }, [initialName])

  useEffect(() => {
    if (!restored.current) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ fields, step }))
    } catch {
      // storage unavailable; the form still works
    }
  }, [fields, step])

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const goNext = () => {
    const stepErrors = validateStep(step, fields)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      setFormError('Please fix the highlighted fields.')
      return
    }
    setErrors({})
    setFormError(null)
    setStep((s) => Math.min(3, s + 1))
  }

  const submit = async () => {
    if (submittingRef.current) return
    for (const s of [1, 2]) {
      const stepErrors = validateStep(s, fields)
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors)
        setFormError('Please fix the highlighted fields.')
        setStep(s)
        return
      }
    }
    const items = shortlist
      .filter((item) => included[item.key])
      .map((item) => ({ product_id: item.product_id, variant_id: item.variant_id, quantity: Number(quantities[item.key]), notes: itemNotes[item.key] || '' }))
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
      setErrors({ items: 'Each product quantity must be a whole number of at least 1.' })
      setFormError('Please fix the highlighted fields.')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await createPortalRequirement({ ...fields, items, submission_key: submissionKey })
      if ('error' in result) {
        setFormError(result.error)
        if (result.fieldErrors) {
          setErrors(result.fieldErrors)
          const fieldKeys = Object.keys(result.fieldErrors) as (keyof Fields)[]
          if (fieldKeys.some((k) => STEP_FIELDS[1].includes(k))) setStep(1)
          else if (fieldKeys.some((k) => STEP_FIELDS[2].includes(k))) setStep(2)
        }
        submittingRef.current = false
        setSubmitting(false)
        return
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      router.push(`/portal/requirements/${result.id}?created=1`)
    } catch {
      setFormError('Something went wrong while submitting. Please check your connection and try again.')
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const purposeOptions = [...PURPOSE_OPTIONS.map((o) => ({ value: o.value, label: o.label })), { value: OTHER_PURPOSE, label: 'Other (type your own)' }]
  const includedCount = shortlist.filter((item) => included[item.key]).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Create New Requirement</h1>
        <p className="mt-2 text-sm text-gray-600 sm:text-base">Tell us what you need, and we&apos;ll prepare a custom quotation.</p>
      </div>

      <ol className="relative mb-8 flex items-center justify-between" aria-label="Progress">
        <div className="absolute left-0 right-0 top-1/2 -z-10 h-0.5 bg-gray-200" />
        {['Details', 'Budget & delivery', 'Products'].map((label, index) => {
          const i = index + 1
          return (
            <li key={label} className="flex flex-col items-center gap-1 bg-[#F1F4F9] px-1">
              <span
                aria-current={step === i ? 'step' : undefined}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  step >= i ? 'bg-[#9C7A33] text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i}
              </span>
              <span className="hidden text-[11px] text-gray-500 sm:block">{label}</span>
            </li>
          )
        })}
      </ol>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
        {formError ? (
          <div role="alert" className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {formError}
          </div>
        ) : null}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (step < 3) goNext()
            else void submit()
          }}
        >
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="border-b pb-2 text-xl font-bold text-gray-900">Step 1: What do you need?</h2>
              <div>
                <label htmlFor="req-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Requirement Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="req-name"
                  type="text"
                  maxLength={120}
                  value={fields.name}
                  onChange={(e) => set('name', e.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  className={inputClass(Boolean(errors.name))}
                  placeholder="e.g. Diwali Gifts 2026"
                />
                <FieldError message={errors.name} />
              </div>
              <div>
                <MobileSheetSelect
                  label="Purpose / Occasion"
                  emptyLabel="Select a purpose"
                  value={fields.purpose}
                  onChange={(purpose) => {
                    set('purpose', purpose)
                    if (purpose !== OTHER_PURPOSE) set('custom_purpose', '')
                  }}
                  options={purposeOptions}
                  showDesktopLabel
                />
                <FieldError message={errors.purpose} />
              </div>
              {fields.purpose === OTHER_PURPOSE ? (
                <div>
                  <label htmlFor="req-custom-purpose" className="mb-1 block text-sm font-medium text-gray-700">
                    Your purpose / occasion <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="req-custom-purpose"
                    type="text"
                    maxLength={MAX_CUSTOM_PURPOSE_LENGTH}
                    value={fields.custom_purpose}
                    onChange={(e) => set('custom_purpose', e.target.value)}
                    aria-invalid={Boolean(errors.custom_purpose)}
                    className={inputClass(Boolean(errors.custom_purpose))}
                    placeholder="e.g. Board meeting giveaways"
                    autoFocus
                  />
                  <FieldError message={errors.custom_purpose} />
                </div>
              ) : null}
              <div>
                <label htmlFor="req-description" className="mb-1 block text-sm font-medium text-gray-700">
                  Description (Optional)
                </label>
                <textarea
                  id="req-description"
                  value={fields.description}
                  maxLength={2000}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 outline-none focus:border-[#9C7A33] focus:ring-1 focus:ring-[#9C7A33]"
                  placeholder="Any specific themes, colours, or preferences?"
                />
                <FieldError message={errors.description} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="border-b pb-2 text-xl font-bold text-gray-900">Step 2: Budget &amp; Logistics</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                <div>
                  <label htmlFor="req-budget" className="mb-1 block text-sm font-medium text-gray-700">
                    Budget per unit (₹, optional)
                  </label>
                  <input
                    id="req-budget"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    value={fields.budget_per_unit}
                    onChange={(e) => set('budget_per_unit', e.target.value)}
                    aria-invalid={Boolean(errors.budget_per_unit)}
                    className={inputClass(Boolean(errors.budget_per_unit))}
                    placeholder="e.g. 500"
                  />
                  <FieldError message={errors.budget_per_unit} />
                </div>
                <div>
                  <label htmlFor="req-qty" className="mb-1 block text-sm font-medium text-gray-700">
                    Total Quantity (optional)
                  </label>
                  <input
                    id="req-qty"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={fields.quantity}
                    onChange={(e) => set('quantity', e.target.value)}
                    aria-invalid={Boolean(errors.quantity)}
                    className={inputClass(Boolean(errors.quantity))}
                    placeholder="e.g. 100"
                  />
                  <FieldError message={errors.quantity} />
                </div>
              </div>
              <div>
                <SheetDateField
                  label="Required By Date *"
                  value={fields.deadline}
                  min={todayLocal()}
                  onChange={(deadline) => set('deadline', deadline)}
                  showDesktopLabel
                />
                <FieldError message={errors.deadline} />
              </div>
              <div>
                <label htmlFor="req-city" className="mb-1 block text-sm font-medium text-gray-700">
                  Delivery City <span className="text-red-500">*</span>
                </label>
                <input
                  id="req-city"
                  type="text"
                  maxLength={80}
                  value={fields.delivery_city}
                  onChange={(e) => set('delivery_city', e.target.value)}
                  aria-invalid={Boolean(errors.delivery_city)}
                  className={inputClass(Boolean(errors.delivery_city))}
                  placeholder="e.g. Bengaluru"
                />
                <FieldError message={errors.delivery_city} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="border-b pb-2 text-xl font-bold text-gray-900">Step 3: Products from your shortlist</h2>
              {shortlist.length === 0 ? (
                <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-600">
                  Your shortlist is empty, so no products will be attached. We&apos;ll suggest options based on your description
                  and budget.{' '}
                  <Link href="/portal/catalogue" className="font-semibold text-[#9C7A33] hover:underline">
                    Browse gifts
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Untick anything you don&apos;t want included, and set the quantity you need for each.
                  </p>
                  <ul className="divide-y rounded-lg border">
                    {shortlist.map((item) => (
                      <li key={item.key} className="flex flex-wrap items-center gap-3 bg-gray-50 p-3">
                        <input
                          type="checkbox"
                          aria-label={`Include ${item.name}`}
                          checked={Boolean(included[item.key])}
                          onChange={(e) => setIncluded((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                          className="h-4 w-4 accent-[#9C7A33]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.sku}
                            {item.colour ? ` · ${item.colour}` : ''}
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          Qty
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            disabled={!included[item.key]}
                            value={quantities[item.key] ?? '1'}
                            onChange={(e) => {
                              setQuantities((prev) => ({ ...prev, [item.key]: e.target.value }))
                              setErrors((prev) => ({ ...prev, items: undefined }))
                            }}
                            className="min-h-9 w-24 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm outline-none focus:border-[#9C7A33] disabled:bg-gray-100"
                          />
                        </label>
                        <label className="block w-full text-xs text-gray-600">
                          Note for this gift (logo, branding, colour…)
                          <input
                            type="text"
                            maxLength={500}
                            disabled={!included[item.key]}
                            value={itemNotes[item.key] ?? ''}
                            onChange={(e) => setItemNotes((prev) => ({ ...prev, [item.key]: e.target.value }))}
                            placeholder="Optional"
                            className="mt-1 min-h-9 w-full rounded-md border border-[#E2E8F0] bg-white px-2 text-sm outline-none focus:border-[#9C7A33] disabled:bg-gray-100"
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500">
                    {includedCount} of {shortlist.length} product{shortlist.length === 1 ? '' : 's'} included.
                  </p>
                </>
              )}
              <FieldError message={errors.items} />
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:justify-between">
            {step > 1 ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setFormError(null)
                  setStep(step - 1)
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#9C7A33] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7C6224] disabled:opacity-50"
            >
              {step < 3 ? 'Next Step' : submitting ? 'Submitting…' : 'Submit Requirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
