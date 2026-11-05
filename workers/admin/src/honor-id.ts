// The item id rule for Club-added items: the shop's slug, kept short enough for the save route's 100-character id limit.

// Longest slug made from a name, leaving room for a "-2".."-9" suffix.
const MAX_ID_LENGTH = 90

/**
 * Makes the id of an item from its name: accents and apostrophes dropped, lower case, every other run of
 * non-letters/digits one dash, no leading or trailing dash.
 * @param name The item's display name.
 * @return The slug, for example "paper-mache"; "item" when the name has no letters or digits.
 */
export function honorId(name: string): string {
  const slug = name
    .normalize('NFKD') // Split letters from their accents.
    .replace(/\p{M}/gu, '') // Drop the accents.
    .toLowerCase() // Lower case.
    .replace(/['’]/g, '') // Apostrophes vanish.
    .replace(/[^a-z0-9]+/g, '-') // Any other run is one dash.
    .replace(/^-+|-+$/g, '') // Trim dashes at both ends.
    .slice(0, MAX_ID_LENGTH) // A long name is cut...
    .replace(/-+$/, '') // ...without leaving a trailing dash.
  return slug === '' ? 'item' : slug // Never empty.
}
