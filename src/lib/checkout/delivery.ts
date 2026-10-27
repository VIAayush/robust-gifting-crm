export type DeliverySettings = { delivery_charge?: unknown; free_delivery_above?: unknown } | null | undefined

/** Base charge: a missing, negative or non-numeric setting counts as 0. */
export function baseDeliveryCharge(settings: DeliverySettings): number {
  const value = Number(settings?.delivery_charge)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** Free-delivery threshold. Blank, zero, negative or non-numeric means "no threshold" (zero would make every order free). */
export function freeDeliveryThreshold(settings: DeliverySettings): number | null {
  const raw = settings?.free_delivery_above
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function deliveryChargeFor(subtotal: number, settings: DeliverySettings): number {
  const threshold = freeDeliveryThreshold(settings)
  return threshold !== null && subtotal >= threshold ? 0 : baseDeliveryCharge(settings)
}
