/**
 * Known corporate-gifting colour names, ordered longest-first so suffix/prefix
 * matching (e.g. "Royal Blue" before "Blue") prefers the more specific name.
 */
export const KNOWN_COLOURS = [
  'Royal Blue',
  'Sky Blue',
  'Bottle Green',
  'Off White',
  'Wine',
  'Burgundy',
  'Turquoise',
  'Teal',
  'Cream',
  'Grey',
  'Gray',
  'Yellow',
  'Orange',
  'Pink',
  'Violet',
  'Purple',
  'Mint',
  'Olive',
  'Green',
  'Brown',
  'Tan',
  'Beige',
  'Maroon',
  'Red',
  'Navy',
  'Blue',
  'White',
  'Black',
] as const

/** Best-effort swatch colour for the on-page colour selector. Unmapped names fall back to a text-only chip. */
export const COLOUR_SWATCH_HEX: Record<string, string> = {
  black: '#1B2430',
  white: '#FFFFFF',
  blue: '#2E5AAC',
  navy: '#1B2A4A',
  'royal blue': '#1E3A8A',
  'sky blue': '#7DB9E8',
  red: '#C23B3B',
  maroon: '#6B1F2A',
  brown: '#6B4A32',
  tan: '#C9A87C',
  beige: '#E7DCC5',
  green: '#3E6B4F',
  'bottle green': '#2C4A3B',
  olive: '#6F6B3A',
  mint: '#A8D5BA',
  purple: '#6B4C9A',
  violet: '#7B5CA6',
  pink: '#E3A0B5',
  orange: '#D97F3F',
  yellow: '#E6C34D',
  grey: '#8B93A0',
  gray: '#8B93A0',
  cream: '#F1E8D6',
  'off white': '#F3F1EA',
  teal: '#2E7D7B',
  turquoise: '#3FBFB0',
  burgundy: '#6E2439',
  wine: '#5C1F2E',
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
}

export function normalizeColourName(raw: string): string {
  return normalizeToken(raw)
}

export function swatchHex(colour: string | null | undefined): string | null {
  if (!colour) return null
  return COLOUR_SWATCH_HEX[normalizeToken(colour)] || null
}

/**
 * If `sku` ends with a recognized colour token (joined by `-`, `_` or space),
 * returns the base SKU and the matched colour name. Otherwise returns null.
 * Longest colour names are checked first so "Royal Blue" wins over "Blue".
 */
export function stripColourSuffixFromSku(sku: string): { base: string; colour: string } | null {
  const normalizedSku = sku.trim().toUpperCase()
  for (const colour of KNOWN_COLOURS) {
    const suffix = colour.toUpperCase().replace(/\s+/g, '[ _-]?')
    const pattern = new RegExp(`[ _-]${suffix}$`, 'i')
    const match = normalizedSku.match(pattern)
    if (match) {
      const base = normalizedSku.slice(0, match.index).trim()
      if (base) return { base, colour }
    }
  }
  return null
}

/** Matches a raw colour cell (from a CSV or form) against the known list; returns the canonical name or the trimmed input if unrecognized. */
export function canonicalColourName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  const normalized = normalizeToken(trimmed)
  const known = KNOWN_COLOURS.find((c) => normalizeToken(c) === normalized)
  return known || trimmed
}
