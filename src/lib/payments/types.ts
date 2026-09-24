export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'refunded'

export type ProviderName = 'demo' | 'payu'

export type CreatePaymentInput = {
  checkoutId: string
  /** Unique per payment ATTEMPT (a retried checkout gets a fresh one) — the idempotency anchor. */
  txnId: string
  /** Rupees, server-computed — never trust a client-supplied amount. */
  amount: number
  productInfo: string
  customerName: string
  customerEmail: string
  customerPhone: string
  /** Absolute production URL PayU redirects back to on success. */
  successUrl: string
  /** Absolute production URL PayU redirects back to on failure. */
  failureUrl: string
}

/**
 * For a redirect-based provider (PayU): an auto-submitting HTML form's
 * target + fields. For the demo provider: null — the checkout page renders
 * its own Demo Payment Mode picker instead of redirecting anywhere.
 */
export type CreatePaymentResult = {
  redirect: { actionUrl: string; fields: Record<string, string> } | null
}

export type VerifyResult =
  | { ok: true; status: 'paid'; providerReference: string | null; raw: unknown }
  | { ok: true; status: 'failed'; failureReason: string | null; raw: unknown }
  | { ok: false; error: string }

export interface PaymentProvider {
  name: ProviderName
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
}
