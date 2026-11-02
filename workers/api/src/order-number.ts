// Makes the order number PF-YYYYMMDD-XXXX in the Worker: the Malaysia date and four random characters, so no counter is needed and buyers abroad see the club's date.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // 31 characters, no 0/O or 1/I/L to misread on paper.
const SUFFIX_LENGTH = 4 // Characters after the date.
const UNBIASED_LIMIT = 248 // 31 * 8: bytes below it map to the alphabet evenly.
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000 // UTC+8 all year, no daylight saving.

/**
 * Makes an order number.
 * @param now The moment of sending; its Malaysia date is used.
 * @param randomValues Fills a byte array with random bytes; the runtime's crypto by default.
 * @return The number, for example "PF-20261102-4K7Q".
 */
export function makeOrderNumber(
  now: Date = new Date(),
  randomValues: (array: Uint8Array<ArrayBuffer>) => Uint8Array = crypto.getRandomValues.bind(crypto),
): string {
  const kl = new Date(now.getTime() + MALAYSIA_OFFSET_MS) // Shifted so UTC getters read Malaysia time.
  const date = `${kl.getUTCFullYear()}${String(kl.getUTCMonth() + 1).padStart(2, '0')}${String(kl.getUTCDate()).padStart(2, '0')}` // YYYYMMDD.
  let suffix = '' // Grows to four characters.
  while (suffix.length < SUFFIX_LENGTH) {
    for (const byte of randomValues(new Uint8Array(new ArrayBuffer(8)))) {
      if (byte >= UNBIASED_LIMIT || suffix.length === SUFFIX_LENGTH) continue // Skip biased bytes, stop at four.
      suffix += ALPHABET[byte % ALPHABET.length] // One character.
    }
  }
  return `PF-${date}-${suffix}` // The number.
}
