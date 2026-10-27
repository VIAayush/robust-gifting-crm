import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { RATE_RULES, checkRateLimit, clientKeyFromHeaders, hashedKey, type RateRule } from '@/lib/security/rate-limit'

/** True when the current caller has exceeded the rule and the action must be refused. */
export async function isRateLimited(rule: RateRule): Promise<boolean> {
  return !(await checkRateLimit(createAdminClient(), rule, clientKeyFromHeaders(await headers(), rule.bucket)))
}

/** Same, but keyed on a value (an e-mail address) instead of the caller's connection. */
export async function isTargetRateLimited(rule: RateRule, value: string): Promise<boolean> {
  return !(await checkRateLimit(createAdminClient(), rule, hashedKey(value, rule.bucket)))
}

export { RATE_RULES }
