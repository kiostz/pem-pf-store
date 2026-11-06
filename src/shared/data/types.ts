// Data shapes: what the shop reads from the API Worker.

// One item as the shop shows it, from the API Worker's /shop.
export type Item = {
  // Slug of the name; never changes once created.
  id: string
  // Display name, e.g. "Knot Tying".
  name: string
  // Category it belongs to, e.g. "Nature".
  category: string
  // Subcategory name within the category, e.g. "Nature" under Honors, or null for none.
  subcategory: string | null
  // Price in ShopSettings.currency's main unit (the API's priceCents divided by 100).
  price: number
  // Units on hand, a whole number of 0 or more.
  stock: number
  // An R2 key such as "items/<id>.webp", or null until a patch picture exists.
  image: string | null
}

// The public settings the shop reads from /shop.
export type ShopSettings = {
  // ISO currency code, three capitals, e.g. "MYR".
  currency: string
}

// One Pathfinder club offered in the order form, as /shop holds it; the four optional fields tell similar clubs apart and are null when unknown.
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
