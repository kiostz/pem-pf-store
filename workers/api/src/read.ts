// Read queries for the public endpoints: runs the SQL and maps rows to the response types.

import type { ShopClub, ShopHonor, ShopLoad, ShopSettings } from './api-types'

// The three public selects, shared by the single endpoints and /shop.
const HONORS_SQL =
  "SELECT id, name, category, price_cents AS priceCents, stock, image FROM items WHERE status = 'active' ORDER BY name COLLATE NOCASE, id" // Hidden honors never leave D1; ties by id.
const CLUBS_SQL = 'SELECT name, area, language, location, church_name AS churchName FROM clubs ORDER BY position, id' // Position, ties by id.
const SETTINGS_SQL = 'SELECT currency FROM settings WHERE id = 1' // The single row.

/**
 * Reads the active honors, ordered by name ignoring case, ties by id.
 * @param db The D1 database.
 * @return The shop honors.
 */
export async function readHonors(db: D1Database): Promise<ShopHonor[]> {
  const { results } = await db // Only the six public columns are selected.
    .prepare(HONORS_SQL) // Shared statement text.
    .all<ShopHonor>() // Rows typed as the response.
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
  const [honors, clubs, settings] = await db.batch([
    db.prepare(HONORS_SQL), // Items.
    db.prepare(CLUBS_SQL), // Clubs.
    db.prepare(SETTINGS_SQL), // Settings.
  ]) // One round trip.
  const row = (settings.results as ShopSettings[])[0] // First settings row, if any.
  if (row === undefined) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return { items: honors.results as ShopHonor[], clubs: clubs.results as ShopClub[], settings: row } // Typed rows.
}
