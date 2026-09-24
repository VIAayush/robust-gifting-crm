import crypto from 'crypto'
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, VerifyResult } from './types'

/**
 * PayU India hosted-checkout integration — verified against PayU's current
 * official docs (docs.payu.in) rather than assumed, since request/hash
 * formats are security-sensitive and must not be invented:
 *   - Payment request:  https://docs.payu.in/docs/prebuilt-checkout-page-integration
 *   - Hash generation:  https://docs.payu.in/docs/hashing-request-and-response
 *   - Verify Payment API: https://docs.payu.in/reference/verify_payment_api
 *   - Callback fields:  https://docs.payu.in/reference/transaction-callback-api
 *
 * Deliberately the hosted-checkout (browser redirect) flow, not the
 * server-to-server card-collection flow — the s2s flow requires collecting
 * raw card numbers on our own server (PCI-DSS scope this project has no
 * need to take on) whereas hosted checkout never lets card data touch our
 * server at all.
 */

function endpointBase(environment: string) {
  return environment === 'production' ? 'https://secure.payu.in' : 'https://test.payu.in'
}

function verifyApiBase(environment: string) {
  return environment === 'production' ? 'https://info.payu.in' : 'https://test.payu.in'
}

function sha512(input: string) {
  return crypto.createHash('sha512').update(input).digest('hex')
}

function getConfig() {
  const key = process.env.PAYU_KEY
  const salt = process.env.PAYU_SALT
  if (!key || !salt) return null
  const environment = process.env.PAYU_ENVIRONMENT === 'production' ? 'production' : 'test'
  return { key, salt, environment }
}

/** True only when both PAYU_KEY and PAYU_SALT are set — used by getActiveProvider() to decide whether PayU can actually run. */
export function isPayuConfigured(): boolean {
  return getConfig() !== null
}

export class PayuPaymentProvider implements PaymentProvider {
  name = 'payu' as const

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const config = getConfig()
    if (!config) throw new Error('PayU is not configured (PAYU_KEY / PAYU_SALT missing).')
    const { key, salt, environment } = config

    // key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
    // — 17 pipe-delimited fields total (verified against docs.payu.in): the 6
    // real fields, 5 empty udf1-udf5 (unused), 5 more empty placeholders, salt.
    const hashString = [
      key,
      input.txnId,
      input.amount.toFixed(2),
      input.productInfo,
      input.customerName,
      input.customerEmail,
      '', '', '', '', '', // udf1-udf5
      '', '', '', '', '', // 5 further empty placeholder fields
      salt,
    ].join('|')

    const fields: Record<string, string> = {
      key,
      txnid: input.txnId,
      amount: input.amount.toFixed(2),
      productinfo: input.productInfo,
      firstname: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      surl: input.successUrl,
      furl: input.failureUrl,
      hash: sha512(hashString),
    }

    return { redirect: { actionUrl: `${endpointBase(environment)}/_payment`, fields } }
  }

  /**
   * Reverse-hash check on the surl/furl POST-back. This alone is NOT
   * sufficient to mark a payment paid (a forged POST to our own callback
   * URL with a correctly-computed hash is still just a client claim) — it
   * only proves the payload wasn't tampered with in transit. Authoritative
   * confirmation is verifyTransaction() below, called separately.
   */
  verifyRedirectHash(fields: Record<string, string>): boolean {
    const config = getConfig()
    if (!config) return false
    const { key, salt } = config
    // SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
    // — 18 fields total (verified against docs.payu.in): salt, status, 5
    // empty placeholders, the 5 udfs (empty, unused), then the 6 echoed fields.
    const udf5 = fields.udf5 || ''
    const udf4 = fields.udf4 || ''
    const udf3 = fields.udf3 || ''
    const udf2 = fields.udf2 || ''
    const udf1 = fields.udf1 || ''
    const hashString = [
      salt,
      fields.status || '',
      '', '', '', '', '',
      udf5, udf4, udf3, udf2, udf1,
      fields.email || '',
      fields.firstname || '',
      fields.productinfo || '',
      fields.amount || '',
      fields.txnid || '',
      key,
    ].join('|')
    const expected = sha512(hashString)
    return expected === fields.hash
  }

  /**
   * Authoritative server-side reconciliation — the check that actually
   * decides whether a payment is paid, per PayU's own guidance to never
   * trust the browser redirect alone.
   */
  async verifyTransaction(txnId: string): Promise<VerifyResult> {
    const config = getConfig()
    if (!config) return { ok: false, error: 'PayU is not configured.' }
    const { key, salt, environment } = config

    const command = 'verify_payment'
    const hash = sha512(`${key}|${command}|${txnId}|${salt}`)
    const body = new URLSearchParams({ key, command, var1: txnId, hash })

    let response: Response
    try {
      response = await fetch(`${verifyApiBase(environment)}/merchant/postservice?form=2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch (error) {
      return { ok: false, error: `Could not reach PayU: ${(error as Error).message}` }
    }

    if (!response.ok) return { ok: false, error: `PayU verify_payment returned HTTP ${response.status}` }

    const json = (await response.json()) as {
      status?: number
      transaction_details?: Record<string, { status?: string; mihpayid?: string; error_Message?: string }>
    }
    const detail = json.transaction_details?.[txnId]
    if (!detail) return { ok: false, error: 'PayU verify_payment returned no matching transaction.' }

    if (detail.status === 'success') {
      return { ok: true, status: 'paid', providerReference: detail.mihpayid || null, raw: json }
    }
    return { ok: true, status: 'failed', failureReason: detail.error_Message || detail.status || 'Payment not successful', raw: json }
  }
}
