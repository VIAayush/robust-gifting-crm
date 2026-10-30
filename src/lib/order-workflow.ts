export const ORDER_LIFECYCLE = [
  "created",
  "confirmed",
  "procurement",
  "printing",
  "quality_check",
  "ready_to_dispatch",
  "dispatched",
  "delivered",
] as const

export type LifecycleStatus = (typeof ORDER_LIFECYCLE)[number] | "cancelled" | "in_progress"

export const ORDER_STATUS_LABELS: Record<string, string> = {
  created: "Order Received",
  confirmed: "Planning",
  in_progress: "In Progress",
  procurement: "Procurement",
  printing: "Printing",
  quality_check: "Quality Check",
  ready_to_dispatch: "Packing",
  dispatched: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  created: "Order Received",
  confirmed: "Planning",
  in_progress: "In Production",
  procurement: "Procurement",
  printing: "Printing",
  quality_check: "Quality Check",
  ready_to_dispatch: "Packing",
  dispatched: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export const STAGE_DEPARTMENT: Record<string, string> = {
  created: "sales",
  confirmed: "sales",
  procurement: "procurement",
  printing: "printing",
  quality_check: "quality",
  ready_to_dispatch: "logistics",
  dispatched: "logistics",
  delivered: "accounts",
}

export type OrderHealth = "on_track" | "at_risk" | "delayed"

export function orderHealth(
  status: string | null | undefined,
  expectedDelivery: string | null | undefined,
  stageDue: string | null | undefined,
  today = new Date()
): OrderHealth {
  if (!status || status === "delivered" || status === "cancelled") return "on_track"
  const day = today.toISOString().slice(0, 10)
  if (expectedDelivery && expectedDelivery < day) return "delayed"
  const inThree = new Date(today)
  inThree.setDate(inThree.getDate() + 3)
  const soon = inThree.toISOString().slice(0, 10)
  if (stageDue && stageDue < day) return "at_risk"
  if (expectedDelivery && expectedDelivery <= soon) return "at_risk"
  return "on_track"
}

export const HEALTH_LABELS: Record<OrderHealth, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  delayed: "Delayed",
}

export const HEALTH_STYLES: Record<OrderHealth, string> = {
  on_track: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  at_risk: "bg-amber-50 text-amber-800 border border-amber-200",
  delayed: "bg-red-50 text-red-800 border border-red-200",
}

export function nextLifecycleStatus(current: string): string | null {
  const i = ORDER_LIFECYCLE.indexOf(current as (typeof ORDER_LIFECYCLE)[number])
  if (i < 0) {
    if (current === "in_progress") return "printing"
    return null
  }
  return ORDER_LIFECYCLE[i + 1] ?? null
}

export function lifecycleIndex(status: string): number {
  if (status === "in_progress") return 2
  const i = ORDER_LIFECYCLE.indexOf(status as (typeof ORDER_LIFECYCLE)[number])
  return i < 0 ? 0 : i
}

export type StageMoveCheck = { ok: true } | { ok: false; error: string }

/**
 * Which stage moves are allowed. Forward moves go one stage at a time; going back one stage (rework) needs a
 * reason; delivered and cancelled orders are closed. Admin may skip forward, and may reopen a closed order, but
 * only with a written reason so the history explains it. The database function advance_order_stage does not check
 * this itself, so every caller in the app must.
 */
export function checkStageMove(current: string, target: string, role: string, comment?: string | null): StageMoveCheck {
  if (current === target) return { ok: true } // a hand-off inside the same stage
  const reason = String(comment ?? '').trim()
  const isAdmin = role === 'admin'

  if (current === 'cancelled') {
    if (isAdmin && target === 'created' && reason) return { ok: true }
    return { ok: false, error: 'A cancelled order is closed. An admin can reopen it to "Order Received" with a reason.' }
  }
  if (current === 'delivered') {
    if (target === 'cancelled') return { ok: false, error: 'A delivered order cannot be cancelled.' }
    if (isAdmin && target === 'dispatched' && reason) return { ok: true }
    return { ok: false, error: 'A delivered order is complete. An admin can move it back to "In Transit" with a reason.' }
  }
  if (target === 'cancelled') return { ok: true }

  const from = lifecycleIndex(current)
  const to = lifecycleIndex(target)
  if (to === from || to === from + 1) return { ok: true }
  if (to > from + 1) {
    if (isAdmin && reason) return { ok: true }
    return { ok: false, error: isAdmin ? 'Skipping stages needs a reason in the comment.' : 'Move the order one stage at a time. Only an admin can skip stages, with a reason.' }
  }
  if (from - to === 1) {
    if (reason) return { ok: true }
    return { ok: false, error: 'Add a reason in the comment to send the order back a stage.' }
  }
  return { ok: false, error: 'An order can only go back one stage at a time.' }
}
