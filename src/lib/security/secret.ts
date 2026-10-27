import { createHash, timingSafeEqual } from 'node:crypto'

/** Constant-time check of an `Authorization: Bearer <secret>` header (both sides hashed, so lengths never leak). */
export function bearerMatches(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !header) return false
  const a = createHash('sha256').update(header).digest()
  const b = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(a, b)
}
