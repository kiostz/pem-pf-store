// Text rules shared by names, searches and cursors: no control characters, bounded length, no outer space.

// Control characters (tab, newline, bell...) and the two Unicode line separators.
const FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u

/**
 * Tells whether text has a control character or a Unicode line separator.
 * @param text Any text.
 * @return True when one is present.
 */
export function hasControlCharacter(text: string): boolean {
  return FORBIDDEN.test(text) // One match is enough.
}

/**
 * Tells whether a value is text of a bounded length (in characters) with no control characters.
 * @param value Anything.
 * @param min The fewest characters.
 * @param max The most characters.
 * @return True for acceptable text.
 */
export function isCleanText(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string') return false // Text only.
  const length = [...value].length // Characters, so an emoji counts once.
  return length >= min && length <= max && !hasControlCharacter(value) // Bounded and clean.
}

/**
 * Parses an item name: 1-100 characters, no control characters, no outer whitespace.
 * @param value The raw name.
 * @return The name, or null when invalid.
 */
export function parseItemName(value: unknown): string | null {
  if (!isCleanText(value, 1, 100)) return null // Length and control characters.
  return value === value.trim() ? value : null // Padding is refused, never trimmed silently.
}
