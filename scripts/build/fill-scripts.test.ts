// Guards the Workers' fresh-database fill scripts (it lives here because the Workers test pool cannot read files, and the root run can): the export must name only the three shop tables, so no order or buyer data can reach the fill file.

import { readFileSync } from 'node:fs' // reads the Workers' package.json
import { resolve } from 'node:path' // joins this file's folder and the relative path
import { describe, expect, it } from 'vitest' // test runner

/** The scripts of the Workers npm project, as written in its package.json. */
const scripts: Record<string, string> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../workers/package.json'), 'utf8'), // the file the user's npm run reads, found from this file's folder so the run folder does not matter
).scripts

/** Every value of a repeated `--table` flag in a command line. */
function tables(command: string): string[] {
  return [...command.matchAll(/--table\s+(\S+)/g)].map((match) => match[1]) // the word after each flag
}

describe('db:export:remote', () => {
  // Catches an export that names orders, order lines or any other table, which would copy buyers' data into the fill file.
  it('exports exactly honors, clubs and settings', () => {
    expect(tables(scripts['db:export:remote']).sort()).toEqual([
      'clubs',
      'honors',
      'settings',
    ])
  })

  // Catches a dropped --table list, where wrangler exports every table including orders.
  it('never exports without a table list', () => {
    expect(scripts['db:export:remote']).toMatch(/--table/) // a list exists
    expect(scripts['db:export:remote']).not.toMatch(/order/i) // no order table is named
  })

  // Catches schema statements in the file, which would fail on a migrated database.
  it('exports data only', () => {
    expect(scripts['db:export:remote']).toContain('--no-schema')
  })

  // Catches an export that does not create api/.wrangler first, which fails with ENOENT on a fresh clone.
  it('creates the output folder before writing', () => {
    expect(scripts['db:export:remote']).toMatch(/^mkdir -p api\/\.wrangler && wrangler d1 export/)
  })

  // Catches the export file landing outside the git-ignored .wrangler folder.
  it('writes under .wrangler', () => {
    expect(scripts['db:export:remote']).toContain(
      '--output api/.wrangler/fill.sql',
    )
  })
})

describe('db:fill:local', () => {
  // Catches a fill aimed at the live database, which would double-insert real items.
  it('runs on the local database only', () => {
    expect(scripts['db:fill:local']).toContain('--local')
    expect(scripts['db:fill:local']).not.toContain('--remote')
  })

  // Catches a fill that reads some other file than the export's output.
  it('reads the file the export writes', () => {
    expect(scripts['db:fill:local']).toContain('--file=api/.wrangler/fill.sql')
  })
})

describe('removed one-time tools', () => {
  // Catches a seed, patch import or D1 import script coming back.
  it('leaves no seed, patches or import script', () => {
    const names = Object.keys(scripts)
    expect(
      names.filter((name) => /^(seed|patches|db:import)/.test(name)),
    ).toEqual([])
  })
})
