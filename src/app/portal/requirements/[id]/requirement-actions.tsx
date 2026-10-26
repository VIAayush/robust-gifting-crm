'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmRequirement, resubmitRequirement, sendBackRequirement } from '../actions'
import type { WorkflowStage } from '@/lib/requirements/workflow'

type Props = {
  requirement: {
    id: string
    stage: WorkflowStage
    description: string
    budget: string
    quantity: string
    deadline: string
    delivery_city: string
  }
}

const inputClass = 'mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#9C7A33] focus:outline-none'
const primaryButton =
  'inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60 sm:w-auto'
const secondaryButton =
  'inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-[#F5F7FA] disabled:opacity-60 sm:w-auto'

export function RequirementActions({ requirement }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [showSendBack, setShowSendBack] = useState(false)
  const [fields, setFields] = useState({
    description: requirement.description,
    budget_per_unit: requirement.budget,
    quantity: requirement.quantity,
    deadline: requirement.deadline,
    delivery_city: requirement.delivery_city,
  })

  function run(task: () => Promise<{ success: true } | { error: string }>) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await task()
        if ('error' in result) setError(result.error)
        else router.refresh()
      } catch {
        setError('Something went wrong. Please check your connection and try again.')
      }
    })
  }

  if (requirement.stage === 'admin_approved') {
    return (
      <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <h2 className="font-serif text-lg">Confirm this requirement</h2>
        <p className="text-sm text-gray-600">
          Our team approved this requirement. Confirm it to start choosing products, or tell us what needs to change.
        </p>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className={primaryButton} disabled={pending} onClick={() => run(() => confirmRequirement(requirement.id))}>
            {pending ? 'Working…' : 'Confirm requirement'}
          </button>
          <button type="button" className={secondaryButton} disabled={pending} onClick={() => setShowSendBack((v) => !v)}>
            Request changes
          </button>
        </div>
        {showSendBack ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              What needs to change?
              <textarea className={inputClass} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className={secondaryButton} disabled={pending || !note.trim()} onClick={() => run(() => sendBackRequirement(requirement.id, note))}>
              Send back to our team
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  if (requirement.stage === 'changes_requested') {
    const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((f) => ({ ...f, [key]: e.target.value }))
    return (
      <section className="space-y-3 rounded-xl border border-amber-200 bg-white p-4">
        <h2 className="font-serif text-lg">Update and resubmit</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Description
            <textarea className={inputClass} rows={3} maxLength={2000} value={fields.description} onChange={set('description')} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Budget per unit (₹)
            <input className={inputClass} inputMode="decimal" value={fields.budget_per_unit} onChange={set('budget_per_unit')} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Quantity
            <input className={inputClass} inputMode="numeric" value={fields.quantity} onChange={set('quantity')} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Required by
            <input className={inputClass} type="date" value={fields.deadline} onChange={set('deadline')} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Delivery city
            <input className={inputClass} value={fields.delivery_city} onChange={set('delivery_city')} />
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            Note for our team (optional)
            <textarea className={inputClass} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          className={primaryButton}
          disabled={pending}
          onClick={() => run(() => resubmitRequirement(requirement.id, { ...fields, note }))}
        >
          {pending ? 'Submitting…' : 'Resubmit requirement'}
        </button>
      </section>
    )
  }

  return null
}
