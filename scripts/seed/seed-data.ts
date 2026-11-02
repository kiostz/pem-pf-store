// Seeds public/data/ from the source honors list; refuses to overwrite existing data without --force.
// Run with `npm run seed` (Node runs the .ts directly, so imports are relative with .ts extensions).

import { existsSync, readFileSync, writeFileSync } from 'node:fs' // Node file helpers
import { parseCsv } from '../../src/shared/data/csv.ts' // CSV reader
import { honorId } from '../../src/shared/data/slug.ts' // id rule
import { serializeData } from '../../src/shared/data/serialize.ts' // stable JSON writer
import type { HonorRecord, Settings } from '../../src/shared/data/types.ts' // data shapes

const requiredColumns = ['honor', 'category', 'skill_level', 'issued_by'] // columns every row must have

/**
 * Turns the source rows into honors, in source order.
 * @param rows rows from parseCsv (columns honor, category, skill_level, issued_by)
 * @param settings supplies the price every honor starts at
 * @return the honors; General Conference ones switched on
 */
export function seedHonors( // rows in, honors out
  rows: Record<string, string>[],
  settings: Settings,
): HonorRecord[] {
  const seen = new Set<string>() // ids used so far
  return rows.map((row) => {
    // one honor per row
    for (const column of requiredColumns) {
      if (row[column] === undefined)
        throw new Error(`Missing column "${column}"`) // e.g. a BOM glued to the header
    }
    const id = honorId(row.honor) // the stable id
    if (id === '')
      throw new Error('Empty honor id (blank line or name without letters)') // an id must name the honor
    if (seen.has(id)) throw new Error(`Duplicate honor id: ${id}`) // ids never change, so never reuse one
    seen.add(id)
    const level = row.skill_level // '' when the list gives none
    if (!['', '1', '2', '3'].includes(level)) {
      throw new Error(`Bad skill_level "${level}" for honor id ${id}`) // fail on bad source data
    }
    return {
      id, // slug
      name: row.honor, // display name
      category: row.category, // grouping
      skillLevel: level === '' ? null : (Number(level) as 1 | 2 | 3), // null when the list gives none
      issuedBy: row.issued_by, // issuing body
      enabled: row.issued_by === 'General Conference', // only these appear in the catalogue
      price: settings.defaultPrice, // starting price
      image: null, // no patch picture yet
    }
  })
}

/**
 * Command line entry: writes honors.json, clubs.json and settings.json under ./public/data.
 * @param args command line arguments; `--force` allows overwriting
 * @return the process exit code
 */
function main(args: string[]): number {
  const honorsPath = 'public/data/honors.json' // the admin owns these files after the first seed
  const clubsPath = 'public/data/clubs.json' // club list
  const settingsPath = 'public/data/settings.json' // currency and default price
  const existing = [honorsPath, clubsPath, settingsPath].filter((path) =>
    existsSync(path),
  ) // files a seed would overwrite
  if (existing.length > 0 && !args.includes('--force')) {
    console.error(
      `${existing.join(', ')} already exist. Run with --force to overwrite.`,
    ) // names only, no data
    return 1 // nothing written
  }
  const settings: Settings = { currency: 'MYR', defaultPrice: 4 } // starting settings
  const rows = parseCsv(
    readFileSync('scripts/seed/adventist-honors.csv', 'utf8'),
  ) // the copied source list
  const honors = seedHonors(rows, settings) // throws on bad data
  writeFileSync(honorsPath, serializeData(honors)) // all honors
  writeFileSync(clubsPath, serializeData([])) // no clubs yet
  writeFileSync(settingsPath, serializeData(settings)) // starting settings
  const on = honors.filter((honor) => honor.enabled).length // switched-on count
  console.log(`Seeded ${honors.length} honors (${on} switched on).`)
  return 0 // success
}

// Run only when started from the command line, not when a test imports seedHonors.
if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(2)) // exit code from main
}
