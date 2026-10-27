import type { SupabaseClient } from '@supabase/supabase-js'
import { PayuPaymentProvider } from '@/lib/payments'
import { createOrderFromCheckout } from '@/app/checkout/order'
import { notifyPaymentResult } from '@/lib/notifications'
import { markCheckoutFailedIfUnpaid } from '@/lib/payments/checkout-state'
import { reconcilePayments, type ReconcileDeps, type ReconcilePayment, type ReconcileSummary } from '@/lib/payments/reconcile'

/** Wires the pure reconciliation rules to the database (service role) and to PayU's Verify Payment API. */
export function buildReconcileDeps(admin: SupabaseClient): ReconcileDeps {
  const provider = new PayuPaymentProvider()
  return {
    async listCandidates(sinceIso) {
      const columns = 'id, checkout_id, provider, provider_txn_id, provider_reference, status, amount, created_at'
      // Two queries so old, fully processed payments can never crowd the unresolved ones out of the 200-row window:
      // unresolved payments, and paid payments whose checkout still has no order.
      const [open, paidWithoutOrder] = await Promise.all([
        admin.from('storefront_payments').select(`${columns}, checkout:storefront_checkouts(order_id)`).in('status', ['pending', 'processing']).gte('created_at', sinceIso).order('created_at').limit(200),
        admin.from('storefront_payments').select(`${columns}, checkout:storefront_checkouts!inner(order_id)`).eq('status', 'paid').is('checkout.order_id', null).gte('created_at', sinceIso).order('created_at').limit(200),
      ])
      if (open.error) throw new Error(open.error.message)
      if (paidWithoutOrder.error) throw new Error(paidWithoutOrder.error.message)
      return [...(open.data || []), ...(paidWithoutOrder.data || [])].map((row) => {
        const checkout = Array.isArray(row.checkout) ? row.checkout[0] : row.checkout
        return {
          id: row.id as string,
          checkout_id: row.checkout_id as string,
          provider: row.provider as string,
          provider_txn_id: row.provider_txn_id as string,
          provider_reference: (row.provider_reference as string | null) ?? null,
          status: row.status as string,
          amount: Number(row.amount),
          created_at: row.created_at as string,
          hasOrder: Boolean(checkout?.order_id),
        } satisfies ReconcilePayment
      })
    },
    verify: (txnId, amount) => provider.verifyTransaction(txnId, amount),
    async claimPaid(paymentId, providerReference, raw) {
      // Conditional claim: only a payment still pending/processing can be moved, so this can never double-process.
      const { data } = await admin
        .from('storefront_payments')
        .update({ status: 'paid', provider_reference: providerReference, raw_response: raw as object, verified_at: new Date().toISOString() })
        .eq('id', paymentId)
        .in('status', ['pending', 'processing'])
        .select('id')
        .maybeSingle()
      return Boolean(data)
    },
    async claimFailed(paymentId, reason, raw) {
      const { data } = await admin
        .from('storefront_payments')
        .update({ status: 'failed', failure_reason: reason, raw_response: raw as object })
        .eq('id', paymentId)
        .in('status', ['pending', 'processing'])
        .select('id')
        .maybeSingle()
      return Boolean(data)
    },
    async markCheckoutFailed(checkoutId) {
      await markCheckoutFailedIfUnpaid(admin, checkoutId)
    },
    createOrder: (checkoutId, reference) => createOrderFromCheckout(checkoutId, { reference }),
    async setFailureNote(paymentId, note) {
      await admin.from('storefront_payments').update({ failure_reason: note }).eq('id', paymentId)
    },
    async notify(paymentId) {
      await notifyPaymentResult(paymentId)
    },
  }
}

export async function runPaymentReconciliation(admin: SupabaseClient): Promise<ReconcileSummary> {
  return reconcilePayments(buildReconcileDeps(admin))
}
