'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runPaymentReconciliation } from '@/lib/payments/reconcile-run'
import type { ReconcileSummary } from '@/lib/payments/reconcile'

/**
 * Finance (admin, accounts) can trigger the same reconciliation the scheduled job runs: stuck PayU payments are
 * re-checked with PayU, and paid payments without an order get their order created. Never marks anything paid
 * unless PayU confirms it.
 */
export async function reconcileOnlinePayments(): Promise<ReconcileSummary | { error: string }> {
  const profile = await getProfile()
  if (!profile || !profile.is_active) return { error: 'Your session has expired. Please sign in again.' }
  if (profile.role !== 'admin' && profile.role !== 'accounts') return { error: 'Only finance can reconcile payments.' }
  const admin = createAdminClient()
  if (!admin) return { error: 'Reconciliation is not available right now.' }
  try {
    const summary = await runPaymentReconciliation(admin)
    revalidatePath('/crm/payments')
    revalidatePath('/crm/orders')
    return summary
  } catch (error) {
    console.error('[payments] reconcile failed', (error as Error).message)
    return { error: 'Reconciliation could not complete. Please try again.' }
  }
}
