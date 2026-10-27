/**
 * PostgREST's ilike/like treat % and _ as wildcards. A value typed by a visitor (an email address, a company name)
 * must match LITERALLY, otherwise "%@gmail.com" or "_" matches somebody else's record. Escape before using ilike.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Case-insensitive exact-match pattern for ilike(): wildcards in the input are escaped. */
export function exactIlike(value: string): string {
  return escapeLikePattern(value.trim())
}
