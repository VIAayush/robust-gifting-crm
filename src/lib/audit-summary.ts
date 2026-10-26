import { LEAD_STAGE_LABELS } from '@/lib/utils'

const IGNORED = new Set(['updated_at', 'created_at', 'id', 'search_vector', 'price_updated_at', 'last_activity_at'])
const IDENTIFYING = ['name', 'full_name', 'title', 'order_number', 'quotation_number', 'invoice_number', 'sku', 'email', 'description']
const MAX_CHANGES = 4

function humanKey(key: string) {
  return key
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

function humanValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (key === 'stage' && typeof value === 'string') return LEAD_STAGE_LABELS[value] || value
  if (typeof value === 'number') return value.toLocaleString('en-IN')
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) return '(linked record)'
    const text = value.replace(/_/g, ' ')
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'none'
  return '(details)'
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function identify(row: Record<string, unknown>) {
  for (const key of IDENTIFYING) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return humanValue(key, value)
  }
  return null
}

/** A one-line, human-readable description of an audit_logs row's change. */
export function summarizeAuditChange(previous: unknown, next: unknown): string {
  const before = asObject(previous)
  const after = asObject(next)

  if (!before && !after) {
    if (typeof next === 'string' && next) return next
    return '—'
  }

  if (before && after) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((k) => !IGNORED.has(k))
    const changed = keys.filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    if (changed.length === 0) return 'No visible changes'
    const parts = changed
      .slice(0, MAX_CHANGES)
      .map((key) => `${humanKey(key)}: ${humanValue(key, before[key])} → ${humanValue(key, after[key])}`)
    const more = changed.length > MAX_CHANGES ? ` (+${changed.length - MAX_CHANGES} more)` : ''
    return parts.join('; ') + more
  }

  if (after) {
    const label = identify(after)
    const keys = Object.keys(after).filter((k) => !IGNORED.has(k) && after[k] !== null && after[k] !== '' && !IDENTIFYING.includes(k))
    const details = keys
      .slice(0, 3)
      .map((key) => `${humanKey(key)}: ${humanValue(key, after[key])}`)
      .join('; ')
    return [label ? `Created ${label}` : 'Created', details].filter(Boolean).join(' · ')
  }

  const label = before ? identify(before) : null
  return label ? `Deleted ${label}` : 'Deleted'
}
