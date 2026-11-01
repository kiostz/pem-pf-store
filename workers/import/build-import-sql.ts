// Turns the shop's three data files into one SQL text for the one-time D1 import, refusing bad data before any SQL exists.

/** Thrown when a data file breaks a rule; the message names the file and entry. */
export class ImportDataError extends Error {
  /**
   * @param message what is wrong, starting with the file and entry
   */
  constructor(message: string) {
    super(message) // keep the text
    this.name = 'ImportDataError' // so callers can tell it from a crash
  }
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/ // lower-case words joined by single hyphens
const CURRENCY = /^[A-Z]{3}$/ // three capital letters, as the settings table requires
const HONOR_KEYS = [
  'id',
  'name',
  'category',
  'skillLevel',
  'issuedBy',
  'enabled',
  'price',
  'image',
] // the eight keys every honor has
const CLUB_KEYS = ['name', 'area', 'language', 'location', 'churchName'] // the five keys every club has
const SETTINGS_KEYS = ['currency', 'defaultPrice'] // the two keys settings has

/**
 * Tells whether a value is a plain object (not null, not a list).
 * @param value anything
 * @return true for a plain object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) // lists and null are not records
}

/**
 * Throws unless the object has exactly the expected keys.
 * @param record the entry
 * @param keys the allowed keys
 * @param where the error prefix naming file and entry
 */
function requireKeys(
  record: Record<string, unknown>,
  keys: string[],
  where: string,
): void {
  const found = Object.keys(record).filter((key) => record[key] !== undefined) // an undefined value counts as missing
  const missing = keys.filter((key) => !found.includes(key)) // required but absent
  const extra = found.filter((key) => !keys.includes(key)) // present but unknown
  if (missing.length > 0)
    throw new ImportDataError(`${where}: missing key ${missing.join(', ')}`) // name the keys
  if (extra.length > 0)
    throw new ImportDataError(`${where}: unexpected key ${extra.join(', ')}`) // name the keys
}

/**
 * Tells whether a string holds a control character (NUL, tab, line break, DEL and the like).
 * @param value the text
 * @return true when any character is U+0000 to U+001F or U+007F
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0 // the character's number
    if (code <= 0x1f || code === 0x7f) return true // control character found
  }
  return false // clean
}

/**
 * Reads a required text field: a non-empty string with no control characters.
 * @param value the field value
 * @param field the field name for the error
 * @param where the error prefix naming file and entry
 * @return the string
 */
function requireText(value: unknown, field: string, where: string): string {
  if (typeof value !== 'string' || value === '' || hasControlCharacter(value))
    // wrong type, empty or control character
    throw new ImportDataError(
      `${where}: ${field} must be a non-empty string with no control characters`,
    ) // names the field
  return value // checked above
}

/**
 * Converts a price in ringgit to whole cents.
 * @param value the price from the file
 * @param field the field name for the error
 * @param where the error prefix naming file and entry
 * @return whole cents, rounded so 4.1 gives 410
 */
function toCents(value: unknown, field: string, where: string): number {
  const cents = typeof value === 'number' ? Math.round(value * 100) : NaN // rounds away float noise such as 410.00000000000006
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(cents) || // not a finite number
    cents < 0 || // negative
    Math.abs(value * 100 - cents) > 1e-6 // more than 2 decimals
  )
    throw new ImportDataError(
      `${where}: ${field} must be 0 or more with at most 2 decimals`,
    ) // bad money
  return cents // whole integer
}

/**
 * Writes a value as a SQL literal.
 * @param value null, a number or a string
 * @return NULL, the number, or the string quoted with `'` doubled
 */
function literal(value: string | number | null): string {
  if (value === null) return 'NULL' // missing value
  if (typeof value === 'number') return String(value) // whole integers only reach here
  return `'${value.replaceAll("'", "''")}'` // the only character that ends a SQL string
}

/**
 * Builds the settings statement.
 * @param settings the parsed settings.json
 * @return one INSERT line
 */
function settingsSql(settings: unknown): string {
  const where = 'settings.json' // error prefix
  if (!isRecord(settings))
    throw new ImportDataError(`${where}: must be an object`) // wrong shape
  requireKeys(settings, SETTINGS_KEYS, where) // exactly currency and defaultPrice
  if (
    typeof settings.currency !== 'string' || // not text
    !CURRENCY.test(settings.currency) // not three capitals
  )
    throw new ImportDataError(
      `${where}: currency must be three capital letters`,
    ) // e.g. MYR
  const cents = toCents(settings.defaultPrice, 'defaultPrice', where) // whole cents
  return `INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, ${literal(settings.currency)}, ${cents}, 1);` // order email starts On
}

/**
 * Builds one INSERT line per honor.
 * @param honors the parsed honors.json
 * @return the INSERT lines in file order
 */
function honorsSql(honors: unknown): string[] {
  if (!Array.isArray(honors) || honors.length === 0)
    throw new ImportDataError('honors.json: must be a non-empty list') // empty or wrong shape
  const seen = new Set<string>() // ids so far
  return honors.map((entry: unknown, index: number) => {
    const id =
      isRecord(entry) && typeof entry.id === 'string' ? entry.id : undefined // for the error prefix
    const where = `honors.json entry ${index + 1}${id === undefined ? '' : ` (${id})`}` // names file, entry, id
    if (!isRecord(entry))
      throw new ImportDataError(`${where}: must be an object`) // wrong shape
    requireKeys(entry, HONOR_KEYS, where) // exactly the eight keys
    if (id === undefined || !SLUG.test(id))
      throw new ImportDataError(`${where}: id must be a lower-case slug`) // not a slug
    if (seen.has(id)) throw new ImportDataError(`${where}: id is repeated`) // repeated id
    seen.add(id) // remember it
    const name = requireText(entry.name, 'name', where) // shown to buyers
    const category = requireText(entry.category, 'category', where) // group heading
    const issuedBy = requireText(entry.issuedBy, 'issuedBy', where) // issuing body
    const skillLevel = entry.skillLevel // null or 1-3
    if (
      skillLevel !== null && // null is allowed
      skillLevel !== 1 && // lowest level
      skillLevel !== 2 && // middle level
      skillLevel !== 3 // highest level
    )
      throw new ImportDataError(`${where}: skillLevel must be 1, 2, 3 or null`) // out of range
    if (typeof entry.enabled !== 'boolean')
      throw new ImportDataError(`${where}: enabled must be true or false`) // wrong type
    const image = entry.image // null or the patch picture path
    if (image !== null && image !== `patches/${id}.webp`)
      throw new ImportDataError(
        `${where}: image must be null or patches/${id}.webp`,
      ) // wrong path
    const priceCents = toCents(entry.price, 'price', where) // whole cents
    const status = entry.enabled ? 'active' : 'hidden' // `enabled` honors start Active
    return `INSERT INTO honors (id, name, category, issued_by, skill_level, status, stock, price_cents, image) VALUES (${literal(id)}, ${literal(name)}, ${literal(category)}, ${literal(issuedBy)}, ${literal(skillLevel)}, ${literal(status)}, 0, ${priceCents}, ${literal(image)});` // stock starts at 0
  })
}

/**
 * Builds one INSERT line per club, positioned 1 to n.
 * @param clubs the parsed clubs.json
 * @return the INSERT lines in file order
 */
function clubsSql(clubs: unknown): string[] {
  if (!Array.isArray(clubs))
    throw new ImportDataError('clubs.json: must be a list') // wrong shape
  const seen = new Set<string>() // names so far
  return clubs.map((entry: unknown, index: number) => {
    const clubName =
      isRecord(entry) && typeof entry.name === 'string' ? entry.name : undefined // for the error prefix
    const where = `clubs.json entry ${index + 1}${clubName === undefined ? '' : ` (${clubName})`}` // names file, entry and club
    if (!isRecord(entry))
      throw new ImportDataError(`${where}: must be an object`) // old string entries land here
    requireKeys(entry, CLUB_KEYS, where) // exactly the five keys
    const name = requireText(entry.name, 'name', where) // required
    if (name !== name.trim())
      throw new ImportDataError(
        `${where}: name must not start or end with spaces`,
      ) // the table refuses padded names
    if (name.toLowerCase() === 'other')
      throw new ImportDataError(`${where}: name must not be "other"`) // reserved for the shop's own option
    if (seen.has(name)) throw new ImportDataError(`${where}: name is repeated`) // names are unique
    seen.add(name) // remember it
    const optional = CLUB_KEYS.slice(1).map((key) => {
      const value = entry[key] // null or a non-empty string
      if (value === null) return null // no value
      return requireText(value, key, where) // "" must be null
    })
    return `INSERT INTO clubs (name, area, language, location, church_name, position) VALUES (${literal(name)}, ${optional.map(literal).join(', ')}, ${index + 1});` // position counts from 1
  })
}

/**
 * Validates the three data files and builds the import SQL.
 * Settings come first, so its single-row rule fails a second run before any honor or club is written.
 * @param files the parsed honors.json, clubs.json and settings.json
 * @return one statement per line, ending with a newline
 * @throws ImportDataError naming the file and entry that break a rule; no SQL is returned then
 */
export function buildImportSql(files: {
  honors: unknown
  clubs: unknown
  settings: unknown
}): string {
  const statements = [
    settingsSql(files.settings), // first: a re-run stops here
    ...honorsSql(files.honors), // then the catalogue
    ...clubsSql(files.clubs), // then the club list
  ]
  return `${statements.join('\n')}\n` // one statement per line
}
