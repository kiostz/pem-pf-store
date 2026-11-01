// Tests for the import writer, run by Node itself (`node --test`): a bad data file must exit 1 and leave no import.sql, so `&&` never reaches wrangler.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

const writer = join(import.meta.dirname, 'write-import-sql.ts') // the script under test
const realData = join(import.meta.dirname, '..', '..', 'public', 'data') // the shop's files, only read
let folder = '' // a fresh temp folder per test
let dataDir = '' // copy of the data files inside it
let outDir = '' // where the writer puts import.sql

/**
 * Runs the writer against the temp folders.
 * @return the exit status, and the error text
 */
function run(): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [writer, dataDir, outDir], {
    encoding: 'utf8',
  }) // a separate Node process, as the npm script runs it
  return { status: result.status, stderr: result.stderr } // what the npm script would see
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'import-writer-')) // empty folder
  dataDir = join(folder, 'data') // copied data
  outDir = join(folder, 'out') // output
  cpSync(realData, dataDir, { recursive: true }) // never edit the real files
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true }) // remove only what the test made
})

describe('write-import-sql', () => {
  // Bug caught: a good run not producing the file wrangler reads.
  it('writes import.sql and exits 0 for the real files', () => {
    const result = run() // good data
    assert.equal(result.status, 0) // success
    assert.ok(existsSync(join(outDir, 'import.sql'))) // file written
  })

  // Bug caught: a bad file printing a message but still letting wrangler run the old SQL.
  it('exits 1, writes nothing and removes an old import.sql when a file is bad', () => {
    run() // a good run leaves an import.sql behind
    writeFileSync(
      join(dataDir, 'settings.json'),
      '{"currency":"myr","defaultPrice":4}',
    ) // now break one file
    const result = run() // bad data
    assert.equal(result.status, 1) // stops the && chain
    assert.match(result.stderr, /settings\.json/) // names the file
    assert.equal(existsSync(join(outDir, 'import.sql')), false) // no stale SQL left
  })

  // Bug caught: a missing file reported as a bare "Error".
  it('names the file and ENOENT when a file is missing', () => {
    rmSync(join(dataDir, 'clubs.json')) // remove one file
    const result = run() // missing data
    assert.equal(result.status, 1) // refused
    assert.match(result.stderr, /clubs\.json: cannot read as JSON \(ENOENT\)/) // file and cause
  })

  // Bug caught: a file that is not JSON crashing with a stack instead of a clear message.
  it('names the file and SyntaxError when a file is not JSON', () => {
    writeFileSync(join(dataDir, 'honors.json'), '[not json') // broken file
    const result = run() // bad data
    assert.equal(result.status, 1) // refused
    assert.match(
      result.stderr,
      /honors\.json: cannot read as JSON \(SyntaxError\)/,
    ) // file and cause
  })
})
