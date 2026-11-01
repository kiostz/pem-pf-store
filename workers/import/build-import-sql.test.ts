// Tests for the one-time import: the real data files run through buildImportSql into the migrated test database, plus every refusal.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import clubsFile from '../../public/data/clubs.json'
import honorsFile from '../../public/data/honors.json'
import settingsFile from '../../public/data/settings.json'
import { ImportDataError, buildImportSql } from './build-import-sql'

const db = env.DB // the test database

const real = { honors: honorsFile, clubs: clubsFile, settings: settingsFile } // the real files, as the writer passes them

// One valid honor entry; tests change one field of a copy.
const honor = {
  id: 'knot-tying',
  name: 'Knot Tying',
  category: 'Nature',
  skillLevel: 1,
  issuedBy: 'General Conference',
  enabled: true,
  price: 4,
  image: 'patches/knot-tying.webp',
}

const club = {
  name: 'Gilead',
  area: null,
  language: null,
  location: null,
  churchName: null,
} // one valid club entry; tests change one field of a copy

type Overrides = Partial<Record<'honors' | 'clubs' | 'settings', unknown>> // which file arguments a test may replace

/**
 * Builds the SQL for small valid files, with some of them replaced.
 * @param overrides the files to replace
 * @return the import SQL
 */
function build(overrides: Overrides): string {
  return buildImportSql({
    honors: [honor], // one honor
    clubs: [club], // one club
    settings: { currency: 'MYR', defaultPrice: 4 }, // valid settings
    ...overrides, // the broken part
  })
}

/**
 * Reads one number from the database.
 * @param sql a query returning one column named n
 * @return that number, or -1 when there is no row
 */
async function count(sql: string): Promise<number> {
  const row = await db.prepare(sql).first<{ n: number }>() // the single result row
  return row?.n ?? -1 // -1 fails every expectation
}

// Storage resets per file, not per test, so every test starts from empty tables.
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM honors'), // honors first
    db.prepare('DELETE FROM clubs'), // then clubs
    db.prepare('DELETE FROM settings'), // then settings
  ])
})

describe('buildImportSql with the real files', () => {
  // Bug caught: hidden honors shown, or honors missing, after the import.
  it('stores 422 honors, 299 active, 123 hidden, all with stock 0 and price 400', async () => {
    await db.exec(buildImportSql(real)) // run the whole import
    expect(await count('SELECT count(*) AS n FROM honors')).toBe(422) // all honors
    expect(
      await count("SELECT count(*) AS n FROM honors WHERE status = 'active'"),
    ).toBe(299) // General Conference honors
    expect(
      await count("SELECT count(*) AS n FROM honors WHERE status = 'hidden'"),
    ).toBe(123) // the rest
    expect(
      await count('SELECT count(*) AS n FROM honors WHERE stock = 0'),
    ).toBe(422) // nothing in stock yet
    expect(
      await count('SELECT count(*) AS n FROM honors WHERE price_cents = 400'),
    ).toBe(422) // RM 4.00
  })

  // Bug caught: null skill levels or images turned into 0 or ''.
  it('keeps null skill levels and null images as NULL', async () => {
    await db.exec(buildImportSql(real)) // run the whole import
    const nullSkill = honorsFile.filter(
      (entry) => entry.skillLevel === null,
    ).length // from the file
    const nullImage = honorsFile.filter((entry) => entry.image === null).length // from the file
    expect(
      await count('SELECT count(*) AS n FROM honors WHERE skill_level IS NULL'),
    ).toBe(nullSkill) // same count in D1
    expect(
      await count('SELECT count(*) AS n FROM honors WHERE image IS NULL'),
    ).toBe(nullImage) // same count in D1
    expect(nullImage).toBe(21) // 422 honors, 401 with a picture
  })

  // Bug caught: club order lost or church names dropped.
  it('stores the 10 clubs at positions 1 to 10 with the Gilead and Panda church names', async () => {
    await db.exec(buildImportSql(real)) // run the whole import
    const { results } = await db
      .prepare(
        'SELECT name, church_name, position FROM clubs ORDER BY position',
      )
      .all<{ name: string; church_name: string | null; position: number }>() // clubs in display order
    expect(results.map((row) => row.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]) // positions 1 to n
    expect(results.map((row) => row.name)).toEqual(
      clubsFile.map((entry) => entry.name),
    ) // file order kept
    expect(results[1]).toMatchObject({
      name: 'Gilead Pathfinder Club',
      church_name: 'Klang BM SDA Church',
    }) // church name kept
    expect(results[2]).toMatchObject({
      name: 'Panda Club',
      church_name: 'Pandamaran SDA Church',
    }) // church name kept
    expect(results[0].church_name).toBeNull() // no church stays NULL
  })

  // Bug caught: wrong currency, price in ringgit instead of cents, or email off.
  it('stores the settings as MYR, 400 cents, order email on', async () => {
    await db.exec(buildImportSql(real)) // run the whole import
    const row = await db.prepare('SELECT * FROM settings').first() // the one row
    expect(row).toEqual({
      id: 1,
      currency: 'MYR',
      default_price_cents: 400,
      order_email_on: 1,
    }) // whole integers
  })

  // Bug caught: a re-run overwriting the admin's stock.
  it('fails a second run on its first statement and changes nothing', async () => {
    await db.exec(buildImportSql(real)) // first run
    await db.exec(
      "UPDATE honors SET stock = 7 WHERE id = 'community-assessment'",
    ) // the admin's change
    await expect(db.exec(buildImportSql(real))).rejects.toThrow(
      /UNIQUE constraint failed: settings\.id/,
    ) // stops at the settings row
    expect(await count('SELECT count(*) AS n FROM honors')).toBe(422) // no extra honors
    expect(await count('SELECT count(*) AS n FROM clubs')).toBe(10) // no extra clubs
    expect(
      await count(
        "SELECT stock AS n FROM honors WHERE id = 'community-assessment'",
      ),
    ).toBe(7) // stock untouched
  })

  // Bug caught: the same input giving different SQL, so a review of the file means nothing.
  it('gives the same SQL for the same files', () => {
    expect(buildImportSql(real)).toBe(buildImportSql(real)) // deterministic
  })

  // Bug caught: statements spanning lines, which the line-by-line exec would split.
  it('writes settings first, then honors, then clubs, one statement per line', () => {
    const lines = buildImportSql(real).trimEnd().split('\n') // every statement
    expect(lines).toHaveLength(1 + 422 + 10) // settings, honors, clubs
    expect(lines[0]).toBe(
      "INSERT INTO settings (id, currency, default_price_cents, order_email_on) VALUES (1, 'MYR', 400, 1);",
    ) // settings first
    expect(lines[1]).toMatch(/^INSERT INTO honors /) // then honors
    expect(lines[423]).toMatch(/^INSERT INTO clubs /) // then clubs
  })
})

describe('buildImportSql text and money', () => {
  // Bug caught: an apostrophe breaking the statement or being stored doubled.
  it('stores the apostrophe name as written', async () => {
    await db.exec(buildImportSql(real)) // run the whole import
    const row = await db
      .prepare("SELECT name FROM honors WHERE name LIKE 'Blood and the Body%'")
      .first<{ name: string }>() // the apostrophe honor
    expect(row?.name).toBe("Blood and the Body's Defenses") // single apostrophe
  })

  // Bug caught: SQL injection through a name.
  it('keeps a crafted name as text', async () => {
    const crafted = "x'); DROP TABLE honors; --" // would end the statement if unescaped
    await db.exec(build({ honors: [{ ...honor, name: crafted }] })) // import it
    const row = await db
      .prepare('SELECT name FROM honors')
      .first<{ name: string }>() // the stored name
    expect(row?.name).toBe(crafted) // stored as text
    expect(await count('SELECT count(*) AS n FROM honors')).toBe(1) // the table still exists
  })

  // Bug caught: escaping that works for one quote but breaks on Unicode, backslashes, comments or statement separators.
  it.each([
    ['accents and emoji', 'Café \u{1F31F} ñ'],
    ['Malay and CJK', 'Kelab Anak Panah 中文'],
    ['a backslash', "back\\slash \\' end"],
    ['a LIKE wildcard and question mark', '100% sure? _x_'],
    ['a line separator', 'a b c'],
    ['a double-dash comment', 'name -- not a comment'],
    ['a block comment', 'a /* b */ c'],
    ['a second statement after a semicolon', "a'; DELETE FROM settings; SELECT '1"],
    ['only quotes', "''''"],
  ])('stores a name with %s exactly as written', async (_label, name) => {
    await db.exec(build({ honors: [{ ...honor, name }], clubs: [{ ...club, name, churchName: name }] })) // import it as honor and club text
    const honorRow = await db.prepare('SELECT name FROM honors').first<{ name: string }>() // stored honor name
    const clubRow = await db.prepare('SELECT name, church_name FROM clubs').first<{ name: string; church_name: string }>() // stored club
    expect(honorRow?.name).toBe(name) // unchanged
    expect(clubRow).toEqual({ name, church_name: name }) // unchanged
    expect(await count('SELECT count(*) AS n FROM settings')).toBe(1) // injected DELETE never ran
  })

  // Bug caught: a crafted category or issuedBy reaching SQL as code.
  it('keeps crafted category and issuedBy as text', async () => {
    const crafted = "x'); DROP TABLE clubs; --" // statement breaker
    await db.exec(build({ honors: [{ ...honor, category: crafted, issuedBy: crafted }] })) // import it
    const row = await db.prepare('SELECT category, issued_by FROM honors').first<{ category: string; issued_by: string }>() // stored
    expect(row).toEqual({ category: crafted, issued_by: crafted }) // text
    expect(await count('SELECT count(*) AS n FROM clubs')).toBe(1) // clubs table survived
  })

  // Bug caught: a crafted id that is not a slug slipping into the SQL.
  it('refuses an id that carries SQL', () => {
    expect(() => build({ honors: [{ ...honor, id: "a'); DROP TABLE honors; --" }] })).toThrow(/honors\.json entry 1/) // not a slug
  })

  // Bug caught: a club name the builder accepts but the table refuses, killing the import half way.
  it.each([' Gilead', 'Gilead　'])('either refuses club name %j up front or lets the table take it', async (name) => {
    let sql: string // set only when the builder accepts the name
    try {
      sql = build({ clubs: [{ ...club, name }] }) // builder accepted it
    } catch (error) {
      expect(error).toBeInstanceOf(ImportDataError) // refused up front: fine
      return
    }
    await db.exec(sql) // accepted: the table must accept it too
    expect(await count('SELECT count(*) AS n FROM clubs')).toBe(1) // stored
  })

  // Bug caught: a failure part-way leaving a state the README recovery steps cannot fix.
  it('can be rerun in full after the three tables are emptied following a part-way failure', async () => {
    const lines = buildImportSql(real).trimEnd().split('\n') // every statement
    await db.exec(lines.slice(0, 50).join('\n')) // the run stops after 49 honors
    await expect(db.exec(buildImportSql(real))).rejects.toThrow(/UNIQUE constraint failed: settings\.id/) // rerun refused
    await db.batch([db.prepare('DELETE FROM honors'), db.prepare('DELETE FROM clubs'), db.prepare('DELETE FROM settings')]) // README recovery
    await db.exec(buildImportSql(real)) // full rerun
    expect(await count('SELECT count(*) AS n FROM honors')).toBe(422) // complete
    expect(await count('SELECT count(*) AS n FROM clubs')).toBe(10) // complete
  })

  // Bug caught: 4.1 * 100 = 410.00000000000006 stored, or refused by the STRICT table.
  it('rounds prices to whole cents', async () => {
    await db.exec(
      build({
        honors: [
          { ...honor, price: 4.1 }, // 410.00000000000006 unrounded
          { ...honor, id: 'b', image: null, price: 0.29 }, // 28.999999999999996 unrounded
          { ...honor, id: 'c', image: null, price: 0 }, // free
        ],
      }),
    )
    const { results } = await db
      .prepare('SELECT price_cents FROM honors ORDER BY id')
      .all<{ price_cents: number }>() // ordered b, c, knot-tying
    expect(results.map((row) => row.price_cents)).toEqual([29, 0, 410]) // whole cents
  })

  // Bug caught: the email switch written as true, which the INTEGER column refuses.
  it('writes the email switch as the integer 1', () => {
    expect(build({})).toContain("VALUES (1, 'MYR', 400, 1);") // literal 1
  })
})

describe('buildImportSql refusals', () => {
  // Label, the files to break, and the message that must name file and entry (entries count from 1).
  const cases: [string, Overrides, RegExp][] = [
    ['an empty honors list', { honors: [] }, /honors\.json/], // nothing to import
    ['honors that are not a list', { honors: {} }, /honors\.json/], // wrong shape
    [
      'a repeated id',
      { honors: [honor, { ...honor }] },
      /honors\.json entry 2 \(knot-tying\)/,
    ], // second entry
    [
      'an id that is not a slug',
      { honors: [{ ...honor, id: 'Knot Tying' }] },
      /honors\.json entry 1/,
    ], // spaces and capitals
    [
      'a negative price',
      { honors: [{ ...honor, price: -1 }] },
      /honors\.json entry 1 \(knot-tying\): price must be 0 or more with at most 2 decimals/,
    ], // below 0
    [
      'a three-decimal price',
      { honors: [{ ...honor, price: 4.005 }] },
      /honors\.json entry 1 \(knot-tying\): price/,
    ], // not whole cents
    [
      'a price in text',
      { honors: [{ ...honor, price: '4' }] },
      /honors\.json entry 1 \(knot-tying\): price/,
    ], // wrong type
    [
      'an extra key',
      { honors: [{ ...honor, stock: 3 }] },
      /honors\.json entry 1 \(knot-tying\)/,
    ], // unknown key
    [
      'a missing key',
      { honors: [{ ...honor, image: undefined }] },
      /honors\.json entry 1 \(knot-tying\)/,
    ], // absent key
    [
      'a wrong image path',
      { honors: [{ ...honor, image: 'patches/other.webp' }] },
      /honors\.json entry 1 \(knot-tying\): image/,
    ], // another honor's picture
    [
      'a skill level of 4',
      { honors: [{ ...honor, skillLevel: 4 }] },
      /honors\.json entry 1 \(knot-tying\): skillLevel/,
    ], // out of range
    [
      'an enabled that is not a boolean',
      { honors: [{ ...honor, enabled: 1 }] },
      /honors\.json entry 1 \(knot-tying\): enabled/,
    ], // wrong type
    [
      'an empty name',
      { honors: [{ ...honor, name: '' }] },
      /honors\.json entry 1 \(knot-tying\): name/,
    ], // empty
    [
      'a name with a line break',
      { honors: [{ ...honor, name: 'a\nb' }] },
      /honors\.json entry 1 \(knot-tying\): name/,
    ], // splits the SQL line
    [
      'a name with a NUL',
      { honors: [{ ...honor, name: 'a\u0000b' }] },
      /honors\.json entry 1 \(knot-tying\): name/,
    ], // would stop SQLite's tokenizer half way
    [
      'a name with a tab',
      { honors: [{ ...honor, name: 'a\tb' }] },
      /honors\.json entry 1 \(knot-tying\): name/,
    ], // control character
    [
      'a club named Other',
      { clubs: [{ ...club, name: 'Other' }] },
      /clubs\.json entry 1 \(Other\)/,
    ], // reserved name
    [
      'a club named OTHER with spaces',
      { clubs: [{ ...club, name: ' OTHER ' }] },
      /clubs\.json entry 1 \( OTHER \)/,
    ], // reserved name, padded
    [
      'a repeated club',
      { clubs: [club, { ...club }] },
      /clubs\.json entry 2 \(Gilead\)/,
    ], // second entry
    [
      'a club field that is an empty string',
      { clubs: [{ ...club, area: '' }] },
      /clubs\.json entry 1 \(Gilead\): area/,
    ], // must be null
    [
      'a club field with a NUL',
      { clubs: [{ ...club, area: 'a\u0000' }] },
      /clubs\.json entry 1 \(Gilead\): area/,
    ], // control character
    [
      'a club with an extra key',
      { clubs: [{ ...club, extra: 1 }] },
      /clubs\.json entry 1 \(Gilead\)/,
    ], // unknown key
    ['a club that is a string', { clubs: ['A'] }, /clubs\.json entry 1/], // old format
    [
      'a lower-case currency',
      { settings: { currency: 'myr', defaultPrice: 4 } },
      /settings\.json/,
    ], // not capitals
    [
      'a bad default price',
      { settings: { currency: 'MYR', defaultPrice: -4 } },
      /settings\.json/,
    ], // below 0
    [
      'an extra settings key',
      { settings: { currency: 'MYR', defaultPrice: 4, extra: 1 } },
      /settings\.json/,
    ], // unknown key
  ]
  // Bug caught: bad data reaching D1, or an error that does not say where to look.
  it.each(cases)('refuses %s', (_label, overrides, message) => {
    expect(() => build(overrides)).toThrow(ImportDataError) // the right error class
    expect(() => build(overrides)).toThrow(message) // names file, entry and cause
  })
})
