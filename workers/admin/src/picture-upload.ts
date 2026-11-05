// The picture upload of the Admin Worker: checks the file, stores it under a new key and points the honor at it only if the admin saw the current picture.

import type { AdminHonor } from './admin-types' // The row shape.
import { readAdminHonors } from './honors' // Reads the current row.

// Largest accepted picture, in bytes.
export const MAX_PICTURE_BYTES = 256 * 1024
// A year, immutable: every upload has its own key, so the bytes behind a key never change.
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

// The picture types accepted, with the key ending each gets.
export type PictureType = 'image/webp' | 'image/png'

// The outcome of an upload.
export type UploadResult =
  | { kind: 'saved'; honor: AdminHonor } // Stored; the row with its new key.
  | { kind: 'conflict'; honors: AdminHonor[]; deletedIds: string[] } // Nothing stored: the current row, or the id of a deleted one.

/**
 * Tells whether the first bytes are those of the claimed picture type.
 * @param bytes The file.
 * @param type The claimed type.
 * @return True when the signature matches (RIFF....WEBP, or the PNG signature).
 */
export function hasSignature(bytes: Uint8Array, type: PictureType): boolean {
  const at = (offset: number, expected: number[]) => expected.every((byte, index) => bytes[offset + index] === byte) // Compares a run of bytes.
  return type === 'image/webp'
    ? at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]) // "RIFF" and "WEBP".
    : at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // The PNG signature.
}

/**
 * Builds a new key for an honor's picture.
 * @param id The honor id.
 * @param type The picture type.
 * @return `items/<id>-<8 random hex>.<webp|png>`.
 */
function newKey(id: string, type: PictureType): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, '0')).join('') // 8 hex digits.
  return `items/${id}-${hex}.${type === 'image/webp' ? 'webp' : 'png'}` // Matches the key pattern for a slug id.
}

/**
 * Deletes an object and never throws: a failure only leaves an orphan.
 * @param bucket The picture bucket.
 * @param key The key.
 * @return Nothing.
 */
async function removeQuietly(bucket: R2Bucket, key: string): Promise<void> {
  try { // R2 can fail.
    await bucket.delete(key) // Remove it.
  } catch (error) { // Leave the orphan.
    console.error('picture cleanup failed', error instanceof Error ? error.name : 'unknown') // Class only.
  }
}

/**
 * Stores a picture and points the honor at it, guarded by the key the admin saw.
 * @param env The database and the picture bucket.
 * @param input The checked id, the key seen (null for none), the type and the bytes.
 * @param now The request time, ISO.
 * @return `saved` with the row, or `conflict` with the current row or the deleted id.
 */
export async function uploadPicture(
  env: { DB: D1Database; PICTURES: R2Bucket },
  input: { id: string; seen: string | null; type: PictureType; bytes: Uint8Array },
  now: string,
): Promise<UploadResult> {
  const { id, seen } = input // The guard.
  const [current] = await readAdminHonors(env.DB, [id]) // The stored row, if any.
  if (current === undefined) return { kind: 'conflict', honors: [], deletedIds: [id] } // Gone.
  if (current.image !== seen) return { kind: 'conflict', honors: [current], deletedIds: [] } // Another picture is there now.
  const key = newKey(id, input.type) // A fresh key, so no cache holds it.
  await env.PICTURES.put(key, input.bytes, { httpMetadata: { contentType: input.type, cacheControl: CACHE_CONTROL } }) // Store first.
  let changes: number // Rows the guarded update changed.
  try { // A failed update must not leave the new object behind.
    const result = await env.DB.prepare('UPDATE honors SET image = ?, modified_at = ? WHERE id = ? AND image IS ?').bind(key, now, id, seen).run() // Same guard again, in the statement.
    changes = result.meta.changes // 0 or 1.
  } catch (error) { // The write failed.
    await removeQuietly(env.PICTURES, key) // Drop the new object.
    throw error // Let the handler answer 500.
  }
  if (changes === 0) { // Someone changed or deleted the row in between.
    await removeQuietly(env.PICTURES, key) // Drop the new object.
    const [after] = await readAdminHonors(env.DB, [id]) // Why: gone, or another picture.
    return after === undefined ? { kind: 'conflict', honors: [], deletedIds: [id] } : { kind: 'conflict', honors: [after], deletedIds: [] } // Deleted, or the current row.
  }
  if (seen !== null) await removeQuietly(env.PICTURES, seen) // The old object is no longer pointed at.
  const [honor] = await readAdminHonors(env.DB, [id]) // The saved row.
  if (honor === undefined) { // Deleted right after the update: nothing points at the new object.
    await removeQuietly(env.PICTURES, key) // Drop the new object.
    return { kind: 'conflict', honors: [], deletedIds: [id] } // Gone.
  }
  return { kind: 'saved', honor } // Done.
}
