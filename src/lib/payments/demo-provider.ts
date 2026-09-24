import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider } from './types'

/**
 * Required now because live PayU credentials aren't available yet — lets
 * the entire checkout → payment → order flow be built and tested end to
 * end. Never pretends to be a real gateway: the checkout UI always labels
 * this "Demo Payment Mode" and offers explicit Success/Failure/Cancel
 * choices instead of a real card form.
 */
export class DemoPaymentProvider implements PaymentProvider {
  name = 'demo' as const

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    void input // interface-required parameter, unused by the demo provider
    // Nothing to redirect to — the checkout page itself renders the demo
    // picker and posts straight to completeDemoPayment.
    return { redirect: null }
  }
}
