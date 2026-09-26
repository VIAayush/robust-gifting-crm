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
