'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/permissions'
import { dispatchNotifications } from '@/lib/notifications'

/** In-app bell notifications (public.notifications) - used by the CRM top bar. */
export async function markNotificationRead(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/crm/dashboard')
}

/** Re-queues a failed/skipped WhatsApp notification and immediately tries to send it again. */
export async function retryNotification(formData: FormData) {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'notifications.manage')
  if ('error' in access) return access
  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Notification is required' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Service unavailable' }
  const { data: row } = await admin.from('notification_outbox').select('id, recipient_phone, status').eq('id', id).maybeSingle()
  if (!row) return { error: 'Notification not found' }
  if (row.status === 'sent') return { error: 'Already sent' }
  if (!row.recipient_phone) return { error: 'This recipient has no phone number on record' }

  await admin.from('notification_outbox').update({ status: 'pending', attempts: 0, last_error: null }).eq('id', id)
  await dispatchNotifications(admin, [id])
  revalidatePath('/crm/notifications')
  return { success: true }
}

export async function dispatchPendingNotifications() {
  const supabase = await createClient()
  const access = await requirePermission(supabase, 'notifications.manage')
  if ('error' in access) return access
  const admin = createAdminClient()
  if (!admin) return { error: 'Service unavailable' }
  const summary = await dispatchNotifications(admin)
  revalidatePath('/crm/notifications')
  return { success: true, ...summary }
}
