// Response types of the public read endpoints: the only fields buyers may see.

// One active honor as the shop lists it.
export interface ShopHonor {
  id: string // Never changes.
  name: string // Shown name.
  category: string // Category label.
  priceCents: number // Whole cents, RM 4.00 is 400.
  stock: number // Units on hand.
  image: string | null // Patch picture path, or none.
}

// One club, the same shape as `Club` in the shop's shared data types.
export interface ShopClub {
  name: string // Unique club name.
  area: string | null // Optional.
  language: string | null // Optional.
  location: string | null // Optional.
  churchName: string | null // Optional.
}

// The public settings; default price and email switch stay admin-only.
export interface ShopSettings {
  currency: string // Three capital letters.
}
