// Read queries for the public endpoints: runs the SQL and maps rows to the response types.

import type { ShopClub, ShopItem, ShopLoad, ShopSettings } from './api-types'

// The three public selects, shared by the single endpoints and /shop.
const ITEMS_SQL =
  "SELECT id, name, category, (SELECT name FROM subcategories WHERE id = items.subcategory_id) AS subcategory, price_cents AS priceCents, stock, image FROM items WHERE status = 'active' ORDER BY name COLLATE NOCASE, id" // Hidden items never leave D1; the subcategory name comes from a primary-key lookup (null for none); ties by id.
const CLUBS_SQL = 'SELECT name, area, language, location, church_name AS churchName FROM clubs ORDER BY position, id' // Position, ties by id.
const SETTINGS_SQL = 'SELECT currency FROM settings WHERE id = 1' // The single row.

/**
 * Reads the active items, ordered by name ignoring case, ties by id.
 * @param db The D1 database.
 * @return The shop items.
 */
export async function readItems(db: D1Database): Promise<ShopItem[]> {
  const { results } = await db // Only the seven public columns are selected.
    .prepare(ITEMS_SQL) // Shared statement text.
    .all<ShopItem>() // Rows typed as the response.
  return results // Column aliases already match the response type.
}

/**
 * Reads the clubs in their shown order.
 * @param db The D1 database.
 * @return The clubs.
 */
export async function readClubs(db: D1Database): Promise<ShopClub[]> {
  const { results } = await db // Five Club fields only.
    .prepare(CLUBS_SQL) // Shared statement text.
    .all<ShopClub>() // Rows typed as the response.
  return results // Nulls stay null.
}

/**
 * Reads the public settings.
 * @param db The D1 database.
 * @return The settings.
 * @throws Error when the settings row is missing.
 */
export async function readSettings(db: D1Database): Promise<ShopSettings> {
  const row = await db.prepare(SETTINGS_SQL).first<ShopSettings>() // The single row.
  if (row === null) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return row // Currency only.
}

/**
 * Reads items, clubs and settings in one D1 batch.
 * @param db The D1 database.
 * @return The whole shop load.
 * @throws Error when the settings row is missing.
 */
export async function readShop(db: D1Database): Promise<ShopLoad> {
  const [items, clubs, settings] = await db.batch([
    db.prepare(ITEMS_SQL), // Items.
    db.prepare(CLUBS_SQL), // Clubs.
    db.prepare(SETTINGS_SQL), // Settings.
  ]) // One round trip.
  const row = (settings.results as ShopSettings[])[0] // First settings row, if any.
  if (row === undefined) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return { items: items.results as ShopItem[], clubs: clubs.results as ShopClub[], settings: row } // Typed rows.
}
