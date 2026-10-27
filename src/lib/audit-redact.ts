/**
 * Cost and margin figures must never be copied into audit_logs: the audit log is readable by more people than the
 * cost columns themselves (a user can read audit rows for changes they made), and its one-line summaries print
 * values. These names mirror the columns protected by migrations 35 and 37; the database trigger (migration 38)
 * redacts the same list, and a test keeps the two in step.
 */
export const COST_FIELDS = [
  'product_cost',
  'printing_cost',
  'courier_cost',
  'other_cost',
  'total_cost',
  'gross_profit',
  'supplier_cost',
  'supplier_cost_snapshot',
  'internal_margin',
] as const

/** Free-text fields that are cost-sensitive only on these entities (a company's own notes stay visible). */
const ENTITY_FIELDS: Record<string, string[]> = {
  products: ['internal_notes'],
  product: ['internal_notes'],
}

export const REDACTED_MARKER = 'restricted_fields_changed'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sensitiveFieldsFor(entity: string | null | undefined): string[] {
  return [...COST_FIELDS, ...(ENTITY_FIELDS[String(entity || '')] || [])]
}

/** Returns the value without cost fields, plus the names (never values) of the restricted fields that were present. */
export function redactAuditValue(entity: string | null | undefined, value: unknown): unknown {
  if (!isObject(value)) return value
  const fields = sensitiveFieldsFor(entity)
  const present = fields.filter((key) => key in value)
  if (present.length === 0) return value
  const clean: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) if (!fields.includes(key)) clean[key] = v
  clean[REDACTED_MARKER] = present
  return clean
}
