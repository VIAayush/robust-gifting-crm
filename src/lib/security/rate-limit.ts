import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Rate limiting for anonymous public actions (enquiry form, personalisation uploads, order lookup).
 *
 * Primary store: the database function rate_limit_check (migration 20261036), shared by every server instance
 * and atomic. If that function is not installed yet, or the database call fails, the limiter falls back to an
 * in-memory window on the current instance. That is weaker (each serverless instance counts separately) but
 * still blunts a burst, and it never blocks real users because of an infrastructure error.
 *
 * Callers pass a hashed client key, never a raw IP address.
 */

export type RateRule = { bucket: string; max: number; windowSeconds: number }

export const RATE_RULES = {
  enquiry: { bucket: 'enquiry', max: 5, windowSeconds: 10 * 60 },
  upload: { bucket: 'upload', max: 10, windowSeconds: 10 * 60 },
  track: { bucket: 'track', max: 20, windowSeconds: 10 * 60 },
  /** Cart quote / order / checkout creation: each call writes customer, lead and order rows. */
  order: { bucket: 'order', max: 10, windowSeconds: 10 * 60 },
  /** Sign-up and password-reset requests send e-mail. Generous enough for an office sharing one address. */
  authEmail: { bucket: 'auth_email', max: 8, windowSeconds: 10 * 60 },
  /** The same mailbox can only be sent a handful of reset / confirmation e-mails per hour, from any address. */
  authEmailTarget: { bucket: 'auth_email_target', max: 3, windowSeconds: 60 * 60 },
  login: { bucket: 'login', max: 30, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateRule>

/** Pure sliding-window counter with an injectable clock, so the behaviour is unit-tested. */
export class MemoryRateLimiter {
  private hits = new Map<string, number[]>()
  private now: () => number
  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  /** Records an attempt and returns true if it is allowed. A blocked attempt is not counted. */
  allow(key: string, max: number, windowSeconds: number): boolean {
    const t = this.now()
    const cutoff = t - windowSeconds * 1000
    const recent = (this.hits.get(key) || []).filter((time) => time > cutoff)
    if (recent.length >= max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(t)
    this.hits.set(key, recent)
    if (this.hits.size > 5000) this.prune(cutoff)
    return true
  }

  private prune(cutoff: number) {
    for (const [key, list] of this.hits) {
      const kept = list.filter((time) => time > cutoff)
      if (kept.length === 0) this.hits.delete(key)
      else this.hits.set(key, kept)
    }
  }
}

const fallback = new MemoryRateLimiter()

/**
 * Stable, non-reversible key for the caller, hashed with the bucket. x-real-ip is set by the hosting platform
 * (Vercel) from the real connection, so it is preferred; the first hop of x-forwarded-for is only a fallback because
 * a client can prepend its own value to that header.
 */
export function clientKeyFromHeaders(headers: { get(name: string): string | null }, bucket: string): string {
  const forwarded = headers.get('x-forwarded-for') || ''
  const ip = headers.get('x-real-ip')?.trim() || forwarded.split(',')[0]?.trim() || 'unknown'
  return createHash('sha256').update(`${bucket}:${ip}`).digest('hex').slice(0, 32)
}

/** Non-reversible key for a value such as an e-mail address (so the limiter never stores it in clear). */
export function hashedKey(value: string, bucket: string): string {
  return createHash('sha256').update(`${bucket}:${value.trim().toLowerCase()}`).digest('hex').slice(0, 32)
}

function isMissingFunction(error: { code?: string; message: string }) {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message)
}

/** True if the action may proceed. */
export async function checkRateLimit(admin: SupabaseClient | null, rule: RateRule, key: string): Promise<boolean> {
  if (admin) {
    const { data, error } = await admin.rpc('rate_limit_check', {
      p_bucket: rule.bucket,
      p_key: key,
      p_max: rule.max,
      p_window_seconds: rule.windowSeconds,
    })
    if (!error && typeof data === 'boolean') return data
    if (error && !isMissingFunction(error)) console.error('[rate-limit] database check failed, using memory window:', error.message)
  }
  return fallback.allow(`${rule.bucket}:${key}`, rule.max, rule.windowSeconds)
}

export const RATE_LIMIT_MESSAGE = 'Too many requests from your connection. Please wait a few minutes and try again.'
