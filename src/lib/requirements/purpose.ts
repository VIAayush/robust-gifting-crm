export const PURPOSE_OPTIONS = [
  { value: 'festival', label: 'Festival (Diwali, Christmas, etc)' },
  { value: 'welcome_kit', label: 'Employee Welcome Kit' },
  { value: 'anniversary', label: 'Work Anniversary' },
  { value: 'client_gifting', label: 'Client Gifting' },
  { value: 'event', label: 'Event / Conference' },
] as const

export const OTHER_PURPOSE = 'other'
export const MAX_CUSTOM_PURPOSE_LENGTH = 80

const LABEL_BY_VALUE = new Map<string, string>([
  ...PURPOSE_OPTIONS.map((o) => [o.value, o.label] as [string, string]),
  [OTHER_PURPOSE, 'Other'],
])

/** Known codes show their label; a client-typed custom purpose is stored as-is and shown as-is. */
export function purposeLabel(value: string | null | undefined) {
  if (!value) return null
  return LABEL_BY_VALUE.get(value) || value
}
