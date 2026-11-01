// Read queries for the public endpoints: runs the SQL and maps rows to the response types.

import type { ShopClub, ShopHonor, ShopSettings } from './api-types'

/**
 * Reads the active honors, ordered by name.
 * @param db The D1 database.
 * @return The shop honors.
 */
export async function readHonors(db: D1Database): Promise<ShopHonor[]> {
  const { results } = await db // Only the six public columns are selected.
    .prepare(
      "SELECT id, name, category, price_cents AS priceCents, stock, image FROM honors WHERE status = 'active' ORDER BY name", // Hidden honors never leave D1.
    )
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
    .prepare('SELECT name, area, language, location, church_name AS churchName FROM clubs ORDER BY position, id') // Position, ties by id.
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
  const row = await db.prepare('SELECT currency FROM settings WHERE id = 1').first<ShopSettings>() // The single row.
  if (row === null) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return row // Currency only.
}
