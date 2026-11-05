// Picture keys and the picture read of the Admin Worker: the admin page shows pictures from its own origin, so a replaced picture is fresh at once and the page CSP needs no new host.

// The shape of an R2 picture key; the shop uses the same pattern, so a key stored here is one the shop shows.
export const PICTURE_KEY = /^items\/[a-z0-9]+(-[a-z0-9]+)*\.(webp|png)$/

/**
 * Reads one picture from R2.
 * @param bucket The picture bucket binding.
 * @param key The key from the request path, still percent-encoded.
 * @param headOnly True to read only the stored metadata, not the bytes.
 * @return The stored object (with a body unless headOnly), or null when the key is outside the pattern (R2 is not asked) or nothing is stored under it.
 */
export async function readPicture(bucket: R2Bucket, key: string, headOnly = false): Promise<R2Object | R2ObjectBody | null> {
  if (!PICTURE_KEY.test(key)) return null // Never ask R2 about a key the shop would not show.
  return headOnly ? bucket.head(key) : bucket.get(key) // Null when missing; head skips the bytes.
}
