/**
 * Real-activity trending. A product's score is built only from things that actually happened: how many
 * order lines (non-cancelled orders, recent window) and how many shortlist/interest entries it has.
 * Scores are used for ordering only and are never displayed, so no popularity figure is ever shown or invented.
 */
export const ORDER_LINE_WEIGHT = 2
export const INTEREST_WEIGHT = 1

export function rankByActivity(orderLineProductIds: string[], interestProductIds: string[], limit = 10): string[] {
  const scores = new Map<string, number>()
  for (const id of orderLineProductIds) if (id) scores.set(id, (scores.get(id) || 0) + ORDER_LINE_WEIGHT)
  for (const id of interestProductIds) if (id) scores.set(id, (scores.get(id) || 0) + INTEREST_WEIGHT)
  return [...scores.entries()]
    // Ties broken by id so the order is stable between renders.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id)
}

/**
 * Trending list: products with real activity first (in score order), then the editorial fallback to fill the rail.
 * `isReal` is true only when at least one product came from real activity, so the heading never overclaims.
 */
export function mergeTrending<T extends { id: string }>(activityIds: string[], catalogue: T[], fallback: T[], limit = 10): { products: T[]; isReal: boolean } {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const real = activityIds.map((id) => byId.get(id)).filter((p): p is T => Boolean(p))
  const picked = new Set(real.map((p) => p.id))
  const filled = [...real, ...fallback.filter((p) => !picked.has(p.id))].slice(0, limit)
  return { products: filled, isReal: real.length > 0 }
}
