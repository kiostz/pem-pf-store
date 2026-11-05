// Reads and saves the settings the admin can change; the save is guarded by the value the admin saw.

import type { AdminSettings, PriceSettings, PricesChange, PricesResult, SettingsChange, SettingsResult } from './admin-types' // The shapes.

/**
 * Reads the settings.
 * @param db The D1 database.
 * @return The settings.
 * @throws Error when the settings row is missing.
 */
export async function readAdminSettings(db: D1Database): Promise<AdminSettings> {
  const row = await db.prepare('SELECT order_email_on AS orderEmailOn FROM settings WHERE id = 1').first<{ orderEmailOn: number }>() // The single row.
  if (row === null) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return { orderEmailOn: row.orderEmailOn === 1 } // A real boolean.
}

/**
 * Saves the settings if they are still what the admin saw.
 * @param db The D1 database.
 * @param change The checked change.
 * @return `saved`, or `conflict` with the current settings and nothing written.
 */
export async function saveAdminSettings(db: D1Database, change: SettingsChange): Promise<SettingsResult> {
  const { from, to } = change.orderEmailOn // What was seen and wanted.
  const result = await db.prepare('UPDATE settings SET order_email_on = ? WHERE id = 1 AND order_email_on = ?').bind(to ? 1 : 0, from ? 1 : 0).run() // The guard is in the statement.
  const settings = await readAdminSettings(db) // The value now.
  return result.meta.changes === 1 ? { kind: 'saved', settings } : { kind: 'conflict', settings } // Written or not.
}

/**
 * Reads the currency and the default price.
 * @param db The D1 database.
 * @return The two values.
 * @throws Error when the settings row is missing.
 */
async function readPrices(db: D1Database): Promise<PriceSettings> {
  const row = await db.prepare('SELECT currency, default_price_cents AS defaultPriceCents FROM settings WHERE id = 1').first<PriceSettings>() // The single row.
  if (row === null) throw new Error('settings-missing') // Surfaces as a 500 with a short code.
  return { currency: row.currency, defaultPriceCents: row.defaultPriceCents } // Just the two fields.
}

/**
 * Saves the currency and the default price if they are still what the admin saw; stored item prices and orders are never written.
 * @param db The D1 database.
 * @param change The checked change.
 * @return `saved` (also when the stored values already equal `to`), or `conflict` with the current values and nothing written.
 */
export async function saveAdminPrices(db: D1Database, change: PricesChange): Promise<PricesResult> {
  const sets: string[] = [] // One assignment per changed field.
  const guards: string[] = [] // One guard per changed field.
  const values: (string | number)[] = [] // The `to` values, then the `from` values.
  const froms: (string | number)[] = [] // The guard values.
  if (change.currency !== undefined) { sets.push('currency = ?'); guards.push('currency = ?'); values.push(change.currency.to); froms.push(change.currency.from) } // The currency.
  if (change.defaultPriceCents !== undefined) { sets.push('default_price_cents = ?'); guards.push('default_price_cents = ?'); values.push(change.defaultPriceCents.to); froms.push(change.defaultPriceCents.from) } // The price.
  const result = await db.prepare(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1 AND ${guards.join(' AND ')}`).bind(...values, ...froms).run() // One guarded statement: all or nothing.
  const prices = await readPrices(db) // The values now.
  if (result.meta.changes === 1) return { kind: 'saved', prices } // Written.
  const already = (change.currency === undefined || prices.currency === change.currency.to) && (change.defaultPriceCents === undefined || prices.defaultPriceCents === change.defaultPriceCents.to) // A retry after a lost answer.
  return { kind: already ? 'saved' : 'conflict', prices } // Already so, or changed since viewing.
}
