// Data shapes: the honors.json record the seed and patch import write, and what the shop reads from the API Worker.

// One honor as honors.json holds it (the seed, the patch import and the file checks use this shape).
export type HonorRecord = {
  // Slug of the name; never changes once created.
  id: string
  // Display name, e.g. "Knot Tying".
  name: string
  // Category it belongs to, e.g. "Nature".
  category: string
  // Skill level 1 to 3, or null when the source list gives none.
  skillLevel: 1 | 2 | 3 | null
  // Who issued it: "General Conference", ..., or "Club" for a club-added honor.
  issuedBy: string
  // True when switched on (shown in the catalogue).
  enabled: boolean
  // Price in Settings.currency.
  price: number
  // "patches/<id>.webp" relative to the base, or null until a patch picture exists.
  image: string | null
}

// One honor as the shop shows it, from the API Worker's /shop.
export type Honor = {
  // Slug of the name; never changes once created.
  id: string
  // Display name, e.g. "Knot Tying".
  name: string
  // Category it belongs to, e.g. "Nature".
  category: string
  // Price in ShopSettings.currency's main unit (the API's priceCents divided by 100).
  price: number
  // Units on hand, a whole number of 0 or more.
  stock: number
  // "patches/<id>.webp" relative to the base, or null until a patch picture exists.
  image: string | null
}

// The public settings the shop reads from /shop.
export type ShopSettings = {
  // ISO currency code, three capitals, e.g. "MYR".
  currency: string
}

// The currency and default price, in settings.json.
export type Settings = {
  // ISO currency code, e.g. "MYR".
  currency: string
  // Price given to every honor at seed time.
  defaultPrice: number
}

// One Pathfinder club offered in the order form, as clubs.json and /shop hold it; the four optional fields tell similar clubs apart and are null when unknown.
export type Club = {
  // Shown in the dropdown and sent in the order; non-empty and unique.
  name: string
  // The club's area, or null.
  area: string | null
  // The club's language, or null.
  language: string | null
  // Where the club meets, or null.
  location: string | null
  // The church the club belongs to, or null.
  churchName: string | null
}

// The clubs offered in the order form, in the API's order.
export type ClubList = Club[]
