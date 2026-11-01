// Reads the shop's three data files and writes import/out/import.sql for `wrangler d1 execute`; writes nothing, and removes an old file, when a data file is bad.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImportDataError, buildImportSql } from './build-import-sql.ts'

const dataDir =
  process.argv[2] ?? join(import.meta.dirname, '..', '..', 'public', 'data') // the shop's data files; a test passes another folder
const outDir = process.argv[3] ?? join(import.meta.dirname, 'out') // gitignored output folder; a test passes another folder

/**
 * Reads and parses one JSON data file.
 * @param name the file name inside the data folder
 * @return the parsed JSON
 * @throws ImportDataError naming the file and the cause (ENOENT, SyntaxError) when it is missing or not JSON
 */
function readJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dataDir, name), 'utf8')) // parsed file
  } catch (error) {
    const cause = (error as NodeJS.ErrnoException).code ?? (error as Error).name // ENOENT for a missing file, else the class
    throw new ImportDataError(`${name}: cannot read as JSON (${cause})`) // cause only, never file content
  }
}

try {
  const sql = buildImportSql({
    honors: readJson('honors.json'), // the catalogue
    clubs: readJson('clubs.json'), // the club list
    settings: readJson('settings.json'), // currency and default price
  })
  mkdirSync(outDir, { recursive: true }) // first run creates the folder
  writeFileSync(join(outDir, 'import.sql'), sql) // overwritten on each run
  console.log(
    `Wrote import/out/import.sql (${sql.trimEnd().split('\n').length} statements)`,
  ) // a count only
} catch (error) {
  if (!(error instanceof ImportDataError)) throw error // a crash keeps its stack
  rmSync(join(outDir, 'import.sql'), { force: true }) // an old file must never run after a refusal
  console.error(`Import refused, nothing written: ${error.message}`) // names file and entry
  process.exitCode = 1 // stops the npm script before wrangler runs
}
