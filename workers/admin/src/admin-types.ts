// Shared types of the Admin Worker's JSON API: also imported type-only by the admin page, so both sides agree.

// Whether buyers can see an item.
export type ItemStatus = 'active' | 'hidden'

// One item as the admin lists it.
export interface AdminItem {
  id: string // Never changes.
  name: string // Shown name.
  category: string // Category label.
  status: ItemStatus // Active or Hidden.
  stock: number // Units on hand.
  priceCents: number // Whole cents.
  image: string | null // The R2 key of the picture, or null for none.
  clubAdded: boolean // True for a Club-added item, the only kind that can be deleted.
  createdAt: string // ISO UTC time with milliseconds.
  modifiedAt: string // ISO UTC time of the last admin edit; an order never changes it.
}

// One page of the admin list.
export interface AdminPage {
  items: AdminItem[] // Up to 50 rows in the requested order.
  nextCursor: string | null // Opaque text for the next page, or null at the end.
}

// What the Add sheet needs: the currency, the starting price and the category list.
export interface AdminMeta {
  currency: string // Three capital letters.
  defaultPriceCents: number // Whole cents.
  categories: string[] // The fixed list.
}

// One item's edits: what the admin saw (`from`) and wants (`to`) per changed field.
export interface ItemChange {
  id: string // Which item.
  name?: { from: string; to: string } // Present when the name changed.
  category?: { from: string; to: string } // Present when the category changed.
  priceCents?: { from: number; to: number } // Present when the price changed.
  status?: { from: ItemStatus; to: ItemStatus } // Present when the status changed.
  stock?: { from: number; to: number } // Present when the stock changed.
}

// The outcome of a save.
export type SaveResult =
  | { kind: 'saved'; items: AdminItem[] } // Written; the saved rows.
  | { kind: 'conflict'; items: AdminItem[]; deletedIds: string[] } // Nothing written: the current rows that no longer match, and ids another admin deleted.
  | { kind: 'name-taken'; ids: string[] } // Nothing written: the ids whose new name another item has.

// A new Club-added item.
export interface NewItem {
  name: string // 1-100 characters.
  category: string // One of the fixed list.
  priceCents: number // 0-99,999.
}

// A delete request: the id and the row as the admin saw it.
export interface DeleteRequest {
  id: string // Which item.
  seen: { name: string; category: string; priceCents: number; status: ItemStatus; stock: number; modifiedAt: string } // The guard.
}

// Where an order is.
export type OrderStep = 'new' | 'paid' | 'handed_out' | 'cancelled'

// One order as the admin lists it.
export interface AdminOrder {
  number: string // The order number.
  createdAt: string // ISO UTC time with milliseconds.
  step: OrderStep // Where the order is.
  currency: string // Three capital letters.
  totalCents: number // Whole cents.
  itemCount: number // Sum of the line quantities.
  club: string // The club as typed or picked.
  buyer: { name: string; email: string; phone: string } // Always present.
  lines: Array<{ itemId: string; name: string; quantity: number; priceCents: number; inShop: boolean }> // Snapshot name and price; `inShop` says the item still exists.
}

// One page of orders.
export interface AdminOrderPage {
  orders: AdminOrder[] // Up to 50, newest first.
  nextCursor: string | null // Opaque text for the next page, or null at the end.
}

// A step change: what the admin saw and wants, and whether a cancel puts stock back.
export interface StepChange {
  number: string // The order number.
  from: OrderStep // The step the admin saw.
  to: OrderStep // The step the admin wants.
  restock: boolean // True only with `to: 'cancelled'`.
}

// The outcome of a step change.
export type StepResult =
  | { kind: 'changed'; order: AdminOrder; restocked: number } // Written; quantity restocked.
  | { kind: 'conflict'; order: AdminOrder } // Nothing written: the order as it is now.
  | { kind: 'not-found' } // No such order.

// The settings the admin can change.
export interface AdminSettings {
  orderEmailOn: boolean // Whether each new order is emailed to the club inbox.
}

// A settings change: what the admin saw and wants.
export interface SettingsChange {
  orderEmailOn: { from: boolean; to: boolean } // The switch.
}

// The outcome of a settings save.
export type SettingsResult =
  | { kind: 'saved'; settings: AdminSettings } // Written.
  | { kind: 'conflict'; settings: AdminSettings } // Nothing written: the settings as they are now.

// The editable fields of a club; the four optional ones are null when blank.
export interface ClubFields {
  name: string // Shown name; never "other" in any case.
  area: string | null // Optional detail.
  language: string | null // Optional detail.
  location: string | null // Optional detail.
  churchName: string | null // Optional detail.
}

// One club as the admin lists it; lists are always in shown order.
export interface AdminClub extends ClubFields {
  id: number // Never changes.
}

// A club edit: what the admin saw (`from`) and wants (`to`).
export interface ClubEdit {
  id: number // Which club.
  from: ClubFields // The values the admin saw.
  to: ClubFields // The wanted values.
}

// A club removal, guarded by what the admin saw.
export interface ClubRemove {
  id: number // Which club.
  seen: ClubFields // The values the admin saw.
}

// A reorder: the id order the admin saw and the wanted one.
export interface ClubOrder {
  from: number[] // Ids in the order the admin saw.
  to: number[] // The same ids in the wanted order.
}

// The outcome of a club write.
export type ClubResult =
  | { kind: 'saved'; clubs: AdminClub[] } // Written (or already so): the whole list.
  | { kind: 'conflict'; clubs: AdminClub[] } // Nothing written: the list as it is now.
  | { kind: 'name-taken' } // Another club holds the name, ignoring case.

// The two shop settings the Settings screen saves together.
export type PriceSettings = Pick<AdminMeta, 'currency' | 'defaultPriceCents'>

// A prices change: what the admin saw (`from`) and wants (`to`) per changed field; at least one is present.
export interface PricesChange {
  currency?: { from: string; to: string } // Three capital letters from the fixed list.
  defaultPriceCents?: { from: number; to: number } // Whole cents.
}

// The outcome of a prices save.
export type PricesResult =
  | { kind: 'saved'; prices: PriceSettings } // Written (or already so).
  | { kind: 'conflict'; prices: PriceSettings } // Nothing written: the values as they are now.
