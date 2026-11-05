// Old order removal: deletes every order more than 12 months old, so the club keeps no buyer's details longer than a year; the order lines go with their order through the foreign key.

/**
 * Deletes every order placed before the same instant one year earlier, with its order lines.
 * @param db The D1 database.
 * @param now The run's time (the scheduled time, so a test can fix it).
 * @return The number of orders deleted; the cascaded order lines are not counted.
 */
export async function removeOldOrders(db: D1Database, now: Date): Promise<number> {
  const cutoff = new Date(now) // A copy, so the caller's date stays as it is.
  const month = cutoff.getUTCMonth() // Before the year changes.
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1) // One year earlier.
  if (cutoff.getUTCMonth() !== month) cutoff.setUTCDate(0) // 29 Feb overflowed to 1 Mar: pin to 28 Feb, never delete under 12 months.
  const { results } = await db.prepare('DELETE FROM orders WHERE created_at < ?1 RETURNING id').bind(cutoff.toISOString()).all() // One statement, so one transaction; strictly older only.
  return results.length // Orders only: meta.changes may or may not count the cascaded lines.
}
