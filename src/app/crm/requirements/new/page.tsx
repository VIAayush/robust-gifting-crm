import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth'
import { createRequirement } from '../actions'
import { BackButton } from '@/components/ui/back-button'
import { redirect } from 'next/navigation'
import { MobileSheetSelect, SheetDateField } from '@/components/ui/mobile-filter-sheet'

export default async function NewRequirementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const profile = await requireStaff(['admin', 'sales', 'management'])
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: companies }, { data: contacts }, { data: owners }] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('contacts').select('id, full_name, company_id').order('full_name'),
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'sales']).eq('is_active', true).order('full_name'),
  ])

  const handleCreate = async (formData: FormData) => {
    'use server'
    const result = await createRequirement(formData)
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      redirect(`/crm/requirements/new?error=${encodeURIComponent(result.error)}`)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton href="/crm/requirements" label="Back to requirements" />
      <h1 className="mb-6 mt-4 text-2xl font-bold text-[var(--color-primary)]">Add Requirement</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <form action={handleCreate} className="grid gap-4 rounded-lg border border-[var(--color-border)] bg-white p-5 text-sm shadow-sm sm:p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Requirement Name *</label>
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Diwali Gifts 2026"
            className="min-h-11 w-full rounded-lg border px-3 py-2"
          />
        </div>

        <MobileSheetSelect
          name="company_id"
          label="Company"
          required
          emptyLabel="Select company"
          options={[
            { value: '', label: 'Select company' },
            ...(companies || []).map((company) => ({ value: company.id, label: company.name })),
          ]}
        />
        <MobileSheetSelect
          name="contact_id"
          label="Contact"
          emptyLabel="Optional contact"
          options={[
            { value: '', label: 'Optional contact' },
            ...(contacts || []).map((contact) => ({ value: contact.id, label: contact.full_name || 'Contact' })),
          ]}
        />
        {profile.role === 'admin' && (
          <MobileSheetSelect
            name="owner_id"
            label="Owner"
            defaultValue={profile.id}
            options={(owners || []).map((owner) => ({
              value: owner.id,
              label: owner.full_name || owner.id,
            }))}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Quantity</label>
            <input type="number" name="quantity" min="1" defaultValue={1} className="min-h-11 w-full rounded-lg border px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Budget</label>
            <input type="number" name="budget" min="0" step="0.01" placeholder="e.g. 50000" className="min-h-11 w-full rounded-lg border px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SheetDateField name="deadline" label="Deadline" showDesktopLabel />
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Delivery City</label>
            <input type="text" name="delivery_city" placeholder="e.g. Mumbai" className="min-h-11 w-full rounded-lg border px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Purpose / Occasion</label>
            <input type="text" name="purpose" placeholder="e.g. Client gifting" className="min-h-11 w-full rounded-lg border px-3 py-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Payment Terms</label>
            <input type="text" name="payment_terms" placeholder="e.g. 50% advance" className="min-h-11 w-full rounded-lg border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Description</label>
          <textarea name="description" rows={3} placeholder="Any specific themes, colours, or preferences?" className="w-full rounded-lg border px-3 py-2" />
        </div>

        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#9C7A33] px-4 text-sm font-semibold text-white hover:bg-[#7C6224]">
          Create Requirement
        </button>
      </form>
    </div>
  )
}
