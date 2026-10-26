'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assignPreferredSuppliers } from '@/lib/orders/preferred-suppliers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { notifyOrderCreated, notifyRequirementEvent } from '@/lib/notifications'
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: ['sent'],
}

export async function updateQuotationStatus(quotationId: string, newStatus: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!['admin', 'sales', 'management'].includes(profile.role)) {
    return { error: 'Not permitted to change quotation status' }
  }

  const supabase = await createClient()
  const { data: quote, error: readError } = await supabase
    .from('quotations')
    .select('id, status, requirement_id')
    .eq('id', quotationId)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!quote) return { error: 'Quotation not found' }

  const current = quote.status || 'draft'
  if (!(ALLOWED_TRANSITIONS[current] || []).includes(newStatus)) {
    return { error: `A ${current} quotation cannot move to ${newStatus}` }
  }

  const { error } = await supabase.from('quotations').update({ status: newStatus }).eq('id', quotationId)
  if (error) return { error: error.message }

  await writeAudit(supabase, {
    action: 'status_change',
    entity: 'quotations',
    entityId: quotationId,
    previous: { status: current },
    next: { status: newStatus },
    userId: profile.id,
  })

  // Quotations that came from a client requirement tell the client their quotation is ready.
  if (newStatus === 'sent' && quote.requirement_id) await notifyRequirementEvent(quote.requirement_id as string, 'quotation_sent')

  revalidatePath(`/crm/quotations/${quotationId}`)
  revalidatePath('/crm/quotations')
  return { success: true }
}
export async function convertToOrder(quotationId: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!['admin', 'sales'].includes(profile.role)) {
    return { error: 'Not permitted to convert quotations' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('convert_quotation_to_order', { p_quotation_id: quotationId })
  if (error) return { error: error.message }
  // Give each new order line its product's preferred supplier (system step, so service role).
  const admin = createAdminClient()
  if (admin && data) {
    const assigned = await assignPreferredSuppliers(admin, data as string)
    if (assigned.error) console.error('[quotations] supplier auto-assign failed', assigned.error)
  }
  await writeAudit(supabase, {
    action: 'create',
    entity: 'orders',
    entityId: data,
    next: { quotation_id: quotationId },
    userId: profile.id,
  })
  await notifyOrderCreated(data)
  redirect(`/crm/orders/${data}`)
}
export async function duplicateQuotation(quotationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('duplicate_quotation', { p_quotation_id: quotationId })
  if (error) return { error: error.message }
  redirect(`/crm/quotations/${data}`)
}
