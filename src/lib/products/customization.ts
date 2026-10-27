/**
 * Fixed, toggleable set of customization fields a product can offer — not a
 * generic form-builder. Shared between the CRM editor (which fields to turn
 * on for a product) and the public customizer (which inputs to render).
 */
export const CUSTOMIZATION_FIELDS = [
  { key: 'logo_upload', label: 'Logo / artwork upload', type: 'file' as const },
  { key: 'personalized_text', label: 'Personalized text', type: 'text' as const },
  { key: 'initials', label: 'Initials', type: 'text' as const },
  { key: 'branding_instructions', label: 'Branding instructions', type: 'textarea' as const },
  { key: 'packaging_instructions', label: 'Packaging instructions', type: 'textarea' as const },
  { key: 'special_instructions', label: 'Special instructions', type: 'textarea' as const },
] as const

export type CustomizationFieldKey = (typeof CUSTOMIZATION_FIELDS)[number]['key']

const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(CUSTOMIZATION_FIELDS.map((f) => [f.key, f.label]))

/** Human label for a stored customization key, e.g. personalized_text -> "Personalized text". */
export function customizationLabel(key: string) {
  return LABEL_BY_KEY[key] || key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** "Personalized text: Happy Diwali · Special instructions: Gold foil" - empty values skipped. */
export function formatCustomization(customization: Record<string, string> | null | undefined, separator = ' · ') {
  if (!customization || typeof customization !== 'object') return ''
  return Object.entries(customization)
    .filter(([, value]) => value)
    .map(([key, value]) => `${customizationLabel(key)}: ${value}`)
    .join(separator)
}

/**
 * Fields a customer MUST fill when the product offers them: the logo and the personal text/initials are the
 * point of a personalised product, so it cannot be bought blank. The instruction boxes are optional.
 * (Business assumption, recorded in docs/SOW_COMPLIANCE_MATRIX.md; change this list if the client decides otherwise.)
 */
export const REQUIRED_CUSTOMIZATION_FIELDS: readonly string[] = ['logo_upload', 'personalized_text', 'initials']

export const CUSTOMIZATION_MAX_LENGTH: Record<string, number> = { personalized_text: 80, initials: 6 }
export const DEFAULT_CUSTOMIZATION_MAX_LENGTH = 500

const INITIALS_RE = /^[\p{L}][\p{L}.\s]*$/u

/**
 * Validates personalisation for ONE product. Used by the add-to-cart button (early feedback) and again by
 * checkout on the server (the real check). Values for fields the product does not offer are ignored.
 * Over-long text is an error, not silently cut short.
 */
export function validateCustomization(
  enabledFields: readonly string[],
  values: Record<string, unknown> | null | undefined,
  hasFile: boolean,
): { ok: true; cleaned: Record<string, string> } | { ok: false; error: string } {
  const cleaned: Record<string, string> = {}
  for (const field of CUSTOMIZATION_FIELDS) {
    if (!enabledFields.includes(field.key) || field.key === 'logo_upload') continue
    const raw = values && typeof values === 'object' ? values[field.key] : ''
    const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
    const required = REQUIRED_CUSTOMIZATION_FIELDS.includes(field.key)
    if (!value) {
      if (required) return { ok: false, error: `${field.label} is required.` }
      continue
    }
    const max = CUSTOMIZATION_MAX_LENGTH[field.key] ?? DEFAULT_CUSTOMIZATION_MAX_LENGTH
    if (value.length > max) return { ok: false, error: `${field.label} must be ${max} characters or fewer.` }
    if (field.key === 'initials' && !INITIALS_RE.test(value)) return { ok: false, error: 'Initials can only contain letters, spaces and full stops.' }
    cleaned[field.key] = value
  }
  if (enabledFields.includes('logo_upload') && REQUIRED_CUSTOMIZATION_FIELDS.includes('logo_upload') && !hasFile) {
    return { ok: false, error: 'Logo / artwork upload is required.' }
  }
  return { ok: true, cleaned }
}
