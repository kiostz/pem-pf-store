// Reads and saves the settings the admin can change; the save is guarded by the value the admin saw.

import type { AdminSettings, SettingsChange, SettingsResult } from './admin-types' // The shapes.

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
