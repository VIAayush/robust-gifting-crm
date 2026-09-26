'use client'

import { useState, useTransition } from 'react'
import { createSupplier, updateSupplier, removeSupplier } from '@/app/crm/suppliers/actions'
import { ConfirmAction } from '@/components/ui/confirm-action'
import { asFormAction } from '@/lib/form-action'

const fieldClass =
  'min-h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs focus:ring-1 focus:ring-[#9C7A33]'
const labelClass = 'mb-1 block text-[11px] font-semibold text-gray-700'

type SupplierValues = {
  id?: string
  name?: string
  supplier_code?: string | null
  legal_name?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  gst_number?: string | null
  category?: string | null
  payment_terms?: string | null
  credit_period_days?: number | null
  credit_limit?: number | null
  lead_time_days?: number | null
  moq?: number | null
  status?: string | null
  notes?: string | null
}

function SupplierFields({ values }: { values: SupplierValues }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Supplier name *</label>
          <input name="name" required defaultValue={values.name || ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Supplier code</label>
          <input name="supplier_code" defaultValue={values.supplier_code || ''} className={fieldClass} placeholder="e.g. SUP-001" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Legal / business name</label>
        <input name="legal_name" defaultValue={values.legal_name || ''} className={fieldClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Contact person</label>
          <input name="contact_person" defaultValue={values.contact_person || ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input name="email" type="email" defaultValue={values.email || ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input name="phone" defaultValue={values.phone || ''} className={fieldClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Address</label>
        <input name="address" defaultValue={values.address || ''} className={fieldClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>City</label>
          <input name="city" defaultValue={values.city || ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>State</label>
          <input name="state" defaultValue={values.state || ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Country</label>
          <input name="country" defaultValue={values.country || 'India'} className={fieldClass} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>GST / tax number</label>
          <input name="gst_number" defaultValue={values.gst_number || ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <input name="category" defaultValue={values.category || ''} className={fieldClass} placeholder="e.g. Printing, Bags" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Payment terms</label>
          <input name="payment_terms" defaultValue={values.payment_terms || ''} className={fieldClass} placeholder="e.g. Net 30" />
        </div>
        <div>
          <label className={labelClass}>Credit period (days)</label>
          <input name="credit_period_days" type="number" min={0} defaultValue={values.credit_period_days ?? 0} className={fieldClass} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Credit limit (₹)</label>
          <input name="credit_limit" type="number" min={0} step="0.01" defaultValue={values.credit_limit ?? 0} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Lead time (days)</label>
          <input name="lead_time_days" type="number" min={0} defaultValue={values.lead_time_days ?? ''} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>MOQ</label>
          <input name="moq" type="number" min={0} defaultValue={values.moq ?? ''} className={fieldClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Status</label>
        <select name="status" defaultValue={values.status || 'active'} className={fieldClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Internal notes</label>
        <textarea name="notes" rows={2} defaultValue={values.notes || ''} className={fieldClass} />
      </div>
    </>
  )
}

export function SupplierCreateForm() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[#9C7A33] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C6224]"
      >
        + Add Supplier
      </button>
    )
  }

  return (
    <form
      action={(formData) => {
        setError(null)
        startTransition(async () => {
          const result = await createSupplier(formData)
          if (result && 'error' in result) setError(result.error)
          else setOpen(false)
        })
      }}
      className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">New supplier</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{error}</p>}
      <SupplierFields values={{}} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#9C7A33] py-2.5 text-xs font-semibold text-white hover:bg-[#7C6224] disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Create Supplier'}
      </button>
    </form>
  )
}

export function SupplierEditForm({ supplier, canDelete }: { supplier: SupplierValues & { id: string }; canDelete: boolean }) {
  return (
    <form action={asFormAction(updateSupplier)} className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <input type="hidden" name="id" value={supplier.id} />
      <h2 className="text-sm font-bold text-gray-900">Edit supplier</h2>
      <SupplierFields values={supplier} />
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-lg bg-[#9C7A33] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7C6224]">
          Save changes
        </button>
        {canDelete && (
          <ConfirmAction
            title="Remove supplier?"
            confirmLabel="Remove"
            action={asFormAction(removeSupplier)}
            hiddenFields={{ id: supplier.id }}
            description={
              <p>
                If this supplier is still referenced by any product or order, it will be marked{' '}
                <span className="font-semibold">Inactive</span> instead of deleted.
              </p>
            }
          >
            Remove supplier
          </ConfirmAction>
        )}
      </div>
    </form>
  )
}
