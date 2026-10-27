'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { friendlyVendorError } from '@/lib/vendors/errors'

const PARTNER_ROLES = ['admin', 'operations', 'management'] as const
// Suppliers are NOT managed here: they have their own screens, statuses (active / inactive / blocked) and the
// suppliers.* permissions. Accepting 'suppliers' in this action would let admin/operations/management bypass them.
const PARTNER_TABLES = ['printing_vendors', 'courier_partners'] as const
type PartnerTable = (typeof PARTNER_TABLES)[number]

const PATHS: Record<PartnerTable, string> = {
  printing_vendors: '/crm/printing-vendors',
  courier_partners: '/crm/courier-partners',
}

function partnerTable(formData: FormData): PartnerTable | null {
  const table = String(formData.get('table') || '')
  return PARTNER_TABLES.includes(table as PartnerTable) ? (table as PartnerTable) : null
}

const SUPPLIER_REFUSAL = 'Suppliers are managed on the Suppliers page, not here.'
const isSupplierRequest = (formData: FormData) => String(formData.get('table') || '') === 'suppliers'

async function requirePartnerEditor() {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' as const }
  if (!PARTNER_ROLES.includes(profile.role as (typeof PARTNER_ROLES)[number])) {
    return { error: 'Not permitted to manage vendors' as const }
  }
  return { profile }
}

function partnerPayload(formData: FormData, table: PartnerTable) {
  const name = String(formData.get('name') || '').trim()
  const base = {
    name,
    contact_person: String(formData.get('contact_person') || '') || null,
    phone: String(formData.get('phone') || '') || null,
    email: String(formData.get('email') || '') || null,
    city: String(formData.get('city') || '') || null,
    notes: String(formData.get('notes') || '') || null,
    is_active: String(formData.get('is_active') || 'true') !== 'false',
  }
  if (table === 'printing_vendors') {
    return {
      ...base,
      service_type: String(formData.get('service_type') || '') || null,
    }
  }
  return {
    ...base,
    service_type: String(formData.get('service_type') || '') || null,
    tracking_supported: String(formData.get('tracking_supported') || '') === 'true',
  }
}

export async function createPartner(formData: FormData) {
  const access = await requirePartnerEditor()
  if ('error' in access) return { error: access.error }
  if (isSupplierRequest(formData)) return { error: SUPPLIER_REFUSAL }
  const table = partnerTable(formData)
  if (!table) return { error: 'Vendor type is required' }
  const payload = partnerPayload(formData, table)
  if (!payload.name) return { error: 'Name is required' }

  const supabase = await createClient()
  const { data, error } = await supabase.from(table).insert(payload as never).select('id').single()
  if (error || !data) return { error: error ? friendlyVendorError(error) : 'Could not create vendor' }
  await writeAudit(supabase, {
    action: 'create',
    entity: table,
    entityId: data.id,
    next: { name: payload.name },
    userId: access.profile.id,
  })
  revalidatePath(PATHS[table])
  return { success: true }
}

export async function updatePartner(formData: FormData) {
  const access = await requirePartnerEditor()
  if ('error' in access) return { error: access.error }
  if (isSupplierRequest(formData)) return { error: SUPPLIER_REFUSAL }
  const table = partnerTable(formData)
  const id = String(formData.get('id') || '')
  if (!table || !id) return { error: 'Vendor is required' }
  const payload = partnerPayload(formData, table)
  if (!payload.name) return { error: 'Name is required' }

  const supabase = await createClient()
  const { error } = await supabase.from(table).update(payload as never).eq('id', id)
  if (error) return { error: friendlyVendorError(error) }
  await writeAudit(supabase, {
    action: 'update',
    entity: table,
    entityId: id,
    next: { name: payload.name },
    userId: access.profile.id,
  })
  revalidatePath(PATHS[table])
  return { success: true }
}

export async function removePartner(formData: FormData) {
  const access = await requirePartnerEditor()
  if ('error' in access) return { error: access.error }
  if (isSupplierRequest(formData)) return { error: SUPPLIER_REFUSAL }
  if (access.profile.role !== 'admin') return { error: 'Only an admin can remove a vendor' }
  const table = partnerTable(formData)
  const id = String(formData.get('id') || '')
  if (!table || !id) return { error: 'Vendor is required' }

  const supabase = await createClient()
  const { data: row } = await supabase.from(table).select('id, name').eq('id', id).maybeSingle()
  if (!row) return { error: 'Vendor not found' }

  const fkColumn =
    table === 'printing_vendors' ? 'printing_vendor_id' : 'courier_partner_id'
  const { count: orderCount } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq(fkColumn, id)

  if (orderCount) {
    const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(PATHS[table])
    return { success: true, archived: true }
  }

  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    await supabase.from(table).update({ is_active: false }).eq('id', id)
    revalidatePath(PATHS[table])
    return { error: 'This vendor is still referenced by orders or products. It was deactivated instead.' }
  }
  await writeAudit(supabase, {
    action: 'delete',
    entity: table,
    entityId: id,
    previous: { name: row.name },
    userId: access.profile.id,
  })
  revalidatePath(PATHS[table])
  return { success: true }
}
