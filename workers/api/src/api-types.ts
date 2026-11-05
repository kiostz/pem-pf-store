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

// Everything the shop needs in one answer.
export interface ShopLoad {
  items: ShopHonor[] // Active honors, name order.
  clubs: ShopClub[] // Clubs in their shown order.
  settings: ShopSettings // Public settings.
}

// The body of POST /orders, after validation.
export interface OrderRequest {
  requestId: string // UUID the shop keeps for a retry of the same cart and form.
  turnstileToken: string // The captcha token, single use.
  name: string // Buyer name, one line.
  email: string // Buyer email, one line.
  phone: string // Buyer phone, one line.
  club: { name: string; typed: boolean } // Club name, and whether the buyer typed it by hand.
  lines: Array<{ honorId: string; quantity: number }> // Ids and quantities only; D1 sets names and prices.
}

// An order as saved; no buyer fields, so it can go back to the browser.
export interface SavedOrder {
  number: string // PF-YYYYMMDD-XXXX.
  createdAt: string // ISO UTC time with milliseconds.
  currency: string // Three capital letters.
  totalCents: number // Whole cents, from the saved lines.
  club: string // The stored club text, "Other: <name>" when typed.
  lines: Array<{ honorId: string; name: string; quantity: number; priceCents: number }> // Saved names and prices.
}

// One line the Worker cannot fill: stock left, or null for a Hidden or missing item.
export interface StockRefusalLine {
  honorId: string // Which item.
  stock: number | null // Units left, or null when it is not for sale.
}
