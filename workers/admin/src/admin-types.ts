// Shared types of the Admin Worker's JSON API: also imported type-only by the admin page, so both sides agree.

// Whether buyers can see a honor.
export type HonorStatus = 'active' | 'hidden'

// One honor as the admin lists it.
export interface AdminHonor {
  id: string // Never changes.
  name: string // Shown name.
  category: string // Category label.
  status: HonorStatus // Active or Hidden.
  stock: number // Units on hand.
  priceCents: number // Whole cents.
  image: string | null // The R2 key of the picture, or null for none.
  clubAdded: boolean // True for a Club-added honor, the only kind that can be deleted.
  createdAt: string // ISO UTC time with milliseconds.
  modifiedAt: string // ISO UTC time of the last admin edit; an order never changes it.
}

// One page of the admin list.
export interface AdminPage {
  honors: AdminHonor[] // Up to 50 rows in the requested order.
  nextCursor: string | null // Opaque text for the next page, or null at the end.
}

// What the Add sheet needs: the currency, the starting price and the category list.
export interface AdminMeta {
  currency: string // Three capital letters.
  defaultPriceCents: number // Whole cents.
  categories: string[] // The fixed list.
}

// One honor's edits: what the admin saw (`from`) and wants (`to`) per changed field.
export interface HonorChange {
  id: string // Which honor.
  name?: { from: string; to: string } // Present when the name changed.
  category?: { from: string; to: string } // Present when the category changed.
  priceCents?: { from: number; to: number } // Present when the price changed.
  status?: { from: HonorStatus; to: HonorStatus } // Present when the status changed.
  stock?: { from: number; to: number } // Present when the stock changed.
}

// The outcome of a save.
export type SaveResult =
  | { kind: 'saved'; honors: AdminHonor[] } // Written; the saved rows.
  | { kind: 'conflict'; honors: AdminHonor[]; deletedIds: string[] } // Nothing written: the current rows that no longer match, and ids another admin deleted.
  | { kind: 'name-taken'; ids: string[] } // Nothing written: the ids whose new name another item has.

// A new Club-added honor.
export interface NewItem {
  name: string // 1-100 characters.
  category: string // One of the fixed list.
  priceCents: number // 0-99,999.
}

// A delete request: the id and the row as the admin saw it.
export interface DeleteRequest {
  id: string // Which honor.
  seen: { name: string; category: string; priceCents: number; status: HonorStatus; stock: number; modifiedAt: string } // The guard.
}
