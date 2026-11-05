// The admin's date text in Malaysia time: the short "changed 3 Nov" on a row and the full time on the Item sheet, so a late-evening UTC time never shows the wrong day.

const ZONE = 'Asia/Kuala_Lumpur' // the club's time zone, as the order number's date uses
const PARTS = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric', // 3
  month: 'short', // Nov
  year: 'numeric', // 2026
  hour: 'numeric', // 8
  minute: '2-digit', // 05
  hour12: true, // am or pm
  timeZone: ZONE, // Malaysia, whatever the browser's zone
}) // one formatter for both texts

/**
 * Reads a time as named parts in Malaysia.
 * @param time the time
 * @return the parts by type, such as day and month
 */
const partsOf = (time: Date): Record<string, string> =>
  Object.fromEntries(
    PARTS.formatToParts(time).map((part) => [part.type, part.value]),
  ) // type to text

/**
 * Writes the short date of a row's last change.
 * @param iso an ISO UTC time with milliseconds
 * @param now the current time
 * @return "changed 3 Nov", or "changed 3 Nov 2025" outside the current year (both read in Malaysia)
 */
export function formatChangedShort(iso: string, now: Date): string {
  const parts = partsOf(new Date(iso)) // the change
  const sameYear = parts.year === partsOf(now).year // this year in Malaysia
  return `changed ${parts.day} ${parts.month}${sameYear ? '' : ` ${parts.year}`}` // the day and month, and the year when not this one
}

/**
 * Writes a full time for the Item sheet.
 * @param iso an ISO UTC time with milliseconds
 * @return "1 Nov 2026, 8:00 am" in Malaysia time
 */
export function formatAdminTime(iso: string): string {
  const parts = partsOf(new Date(iso)) // the time
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()}` // day month year, time with a lowercase am or pm
}

/**
 * Writes a day for the "Buyer details removed on" line.
 * @param iso an ISO UTC time with milliseconds
 * @return "5 Nov 2027" in Malaysia time
 */
export function formatAdminDay(iso: string): string {
  const parts = partsOf(new Date(iso)) // the time
  return `${parts.day} ${parts.month} ${parts.year}` // day month year
}
