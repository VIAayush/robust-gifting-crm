// Pure logic for the staff "Add products" picker. Kept free of React and Supabase so it can be unit tested.

export type PriceRange = { min: number | null; max: number | null }

/** Parses a user/URL value into a finite number >= 0, otherwise null. */
export function parsePrice(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Sanitises a min/max pair from the URL: invalid values are dropped and a reversed pair is swapped. */
export function sanitisePriceRange(min: unknown, max: unknown): PriceRange {
  const lo = parsePrice(min)
  const hi = parsePrice(max)
  if (lo !== null && hi !== null && lo > hi) return { min: hi, max: lo }
  return { min: lo, max: hi }
}

/**
 * Clamps a chosen range into the bounds. A reversed pair is swapped; non-numeric input falls back to the bound.
 * `moved` says which thumb the user is dragging: that thumb stops at the other one instead of swapping.
 */
export function clampRange(lo: number, hi: number, floor: number, ceil: number, moved?: 'min' | 'max'): { min: number; max: number } {
  const f = Number.isFinite(floor) ? floor : 0
  const c = Number.isFinite(ceil) ? Math.max(ceil, f) : f
  const clamp = (v: number, fallback: number) => Math.min(c, Math.max(f, Number.isFinite(v) ? v : fallback))
  let a = clamp(lo, f)
  let b = clamp(hi, c)
  if (a > b) {
    if (moved === 'min') a = b
    else if (moved === 'max') b = a
    else [a, b] = [b, a]
  }
  return { min: a, max: b }
}

/** URL params for a range: an end that sits on its bound is "no filter", so it is omitted. */
export function rangeToParams(lo: number, hi: number, floor: number, ceil: number): { min?: string; max?: string } {
  const r = clampRange(lo, hi, floor, ceil)
  return {
    min: r.min > floor ? String(r.min) : undefined,
    max: r.max < ceil ? String(r.max) : undefined,
  }
}

export type PickerRow = { id: string; price: number | null }

export function hasValidPrice(price: number | null | undefined): boolean {
  return typeof price === 'number' && Number.isFinite(price) && price > 0
}

/** A row can be ticked when it is priced, not already in the catalogue, and the user can edit. */
export function isEligible(row: PickerRow, already: ReadonlySet<string>, canEdit: boolean): boolean {
  return canEdit && !already.has(row.id) && hasValidPrice(row.price)
}

export function eligibleIds(rows: readonly PickerRow[], already: ReadonlySet<string>, canEdit: boolean): string[] {
  return rows.filter((r) => isEligible(r, already, canEdit)).map((r) => r.id)
}

export function pageSelectionState(ids: readonly string[], selected: ReadonlySet<string>): 'none' | 'some' | 'all' {
  if (ids.length === 0) return 'none'
  const n = ids.filter((id) => selected.has(id)).length
  return n === 0 ? 'none' : n === ids.length ? 'all' : 'some'
}

/** Select (on) or deselect (off) the given ids, leaving every other selected id alone. */
export function setMany(selected: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const next = new Set(selected)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  return setMany(selected, [id], !selected.has(id))
}

/** Header checkbox: if every eligible row on the page is selected, deselect them; otherwise select them all. */
export function togglePage(selected: ReadonlySet<string>, pageIds: readonly string[]): Set<string> {
  return setMany(selected, pageIds, pageSelectionState(pageIds, selected) !== 'all')
}

/** Drops ids that are already in the catalogue. Returns the same set when nothing changed. */
export function pruneSelection(selected: ReadonlySet<string>, already: ReadonlySet<string>): ReadonlySet<string> {
  for (const id of selected) if (already.has(id)) return new Set([...selected].filter((x) => !already.has(x)))
  return selected
}

/** Selected ids that are not on the visible page (other pages, or hidden by the current filters). */
export function offPageCount(selected: ReadonlySet<string>, visibleIds: readonly string[]): number {
  const visible = new Set(visibleIds)
  let n = 0
  for (const id of selected) if (!visible.has(id)) n++
  return n
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function storageKey(campaignId: string) {
  return `catalogue-picker:${campaignId}`
}

export function serialiseSelection(selected: ReadonlySet<string>): string {
  return JSON.stringify([...selected])
}

/** Reads a stored selection defensively: bad JSON, non-arrays and non-uuid entries are ignored. */
export function parseStoredSelection(raw: string | null | undefined, already: ReadonlySet<string>): Set<string> {
  if (!raw) return new Set()
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return new Set()
    return new Set(data.filter((x): x is string => typeof x === 'string' && ID.test(x) && !already.has(x)))
  } catch {
    return new Set()
  }
}
