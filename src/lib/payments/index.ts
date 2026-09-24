import { DemoPaymentProvider } from './demo-provider'
import { PayuPaymentProvider, isPayuConfigured } from './payu-provider'
import type { PaymentProvider, ProviderName } from './types'

export type { PaymentProvider, ProviderName, CreatePaymentInput, CreatePaymentResult, VerifyResult, PaymentStatus } from './types'
export { PayuPaymentProvider, isPayuConfigured } from './payu-provider'
export { DemoPaymentProvider } from './demo-provider'

/**
 * PAYMENT_PROVIDER=demo | payu, defaulting to demo. If payu is requested but
 * PAYU_KEY/PAYU_SALT aren't set, falls back to demo instead of breaking the
 * checkout — the app must keep working end to end with no PayU credentials
 * present, per the Phase 1 requirement that this be demo-first.
 */
export function getActiveProviderName(): ProviderName {
  const requested = process.env.PAYMENT_PROVIDER === 'payu' ? 'payu' : 'demo'
  if (requested === 'payu' && !isPayuConfigured()) return 'demo'
  return requested
}

export function getActiveProvider(): PaymentProvider {
  return getActiveProviderName() === 'payu' ? new PayuPaymentProvider() : new DemoPaymentProvider()
}
