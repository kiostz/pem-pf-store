// One-time import of patch pictures from the Pathfinder Wiki into public/patches/, then `image` in honors.json and a report of the misses.
// Run with `npm run patches`; it is resumable, so an interrupted or partly failed run is finished by running it again.

import { execFile } from 'node:child_process' // runs cwebp
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs' // file helpers
import { tmpdir } from 'node:os' // temp folder location
import { join } from 'node:path' // path helper
import { promisify } from 'node:util' // makes execFile awaitable
import { patchImagePath } from '../../src/shared/data/patch.ts' // the picture path rule
import { serializeData } from '../../src/shared/data/serialize.ts' // stable JSON writer
import type { HonorRecord } from '../../src/shared/data/types.ts' // data shape
import {
  fetchWithRetry,
  findInsignias,
  findPictureUrls,
  wikiPageTitle,
} from './wiki.ts' // wiki client

const run = promisify(execFile) // awaitable execFile

/** An honor that got no picture, and why. */
export type PatchMiss = {
  id: string // honor id
  name: string // honor name
  reason:
    'no-page' | 'no-insignia' | 'no-file' | 'fetch-failed' | 'convert-failed' // why
  tried: string // last page title or file name asked
}

/** Everything the import needs from the outside, so tests can fake it. */
export type ImportDeps = {
  fetchFn: typeof fetch // the HTTP call
  sleep: (ms: number) => Promise<void> // waits between retries
  convert: (input: Uint8Array, outPath: string) => Promise<void> // image bytes → WebP file
  patchesDir: string // where `<id>.webp` files go
  log: (line: string) => void // progress lines (ids and counts only)
}

/**
 * Converts image bytes to WebP (quality 80) with the cwebp command line tool.
 * @param input the downloaded image
 * @param outPath the WebP file to write
 * @return resolves when cwebp exits 0, rejects otherwise
 */
export async function cwebpConvert(
  input: Uint8Array,
  outPath: string,
): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'patch-')) // private temp folder for the input
  try {
    const inputPath = join(folder, 'input') // cwebp sniffs the format, no extension needed
    writeFileSync(inputPath, input) // the downloaded bytes
    await run('cwebp', ['-q', '80', '-o', outPath, '--', inputPath]) // WebP, quality 80
  } finally {
    rmSync(folder, { recursive: true, force: true }) // never leave the input behind
  }
}

/**
 * Phase 1: downloads and converts a picture for every honor that has none yet.
 * @param honors all honors; club-added ones are skipped
 * @param deps HTTP, converter, folder and log
 * @return counts, the misses and the groups of honors that share one wiki file
 */
export async function importPatches(
  honors: HonorRecord[],
  deps: ImportDeps,
): Promise<{
  saved: number
  skipped: number
  misses: PatchMiss[]
  shared: string[][]
}> {
  mkdirSync(deps.patchesDir, { recursive: true }) // make sure the folder exists
  for (const name of readdirSync(deps.patchesDir))
    if (name.endsWith('.webp.tmp'))
      rmSync(join(deps.patchesDir, name), { force: true }) // left by a killed run
  const wikiHonors = honors.filter((h) => h.issuedBy !== 'Club') // every honor the wiki can know
  const hasFile = (h: HonorRecord) =>
    existsSync(join(deps.patchesDir, `${h.id}.webp`)) // picture already saved
  const todoIds = new Set(
    wikiHonors.filter((h) => !hasFile(h)).map((h) => h.id),
  ) // honors still needing a picture
  const skipped = wikiHonors.length - todoIds.size // honors already done
  const allMisses: PatchMiss[] = [] // misses of all honors; only todo ones are reported
  const wiki = { fetchFn: deps.fetchFn, sleep: deps.sleep, log: deps.log } // lookup deps
  const fileOf = new Map<string, string>() // honor id → wiki file name

  /** Files each honor's result: its file name, a retry request, or a miss. */
  const settle = (
    list: HonorRecord[],
    titleOf: (h: HonorRecord) => string,
    answers: Map<string, string | null | 'no-insignia' | 'fetch-failed'>,
    finalRound: boolean,
  ): HonorRecord[] => {
    const retry: HonorRecord[] = [] // honors to try again with the shorter title
    for (const honor of list) {
      const title = titleOf(honor) // the title asked
      const answer = answers.get(title) // the wiki's answer
      if (answer === 'fetch-failed' || answer === 'no-insignia')
        allMisses.push({
          id: honor.id,
          name: honor.name,
          reason: answer,
          tried: title,
        }) // a page without insignia is final: no shorter title
      else if (answer !== null && answer !== undefined)
        fileOf.set(honor.id, answer) // remember the picture file
      else if (!finalRound && wikiPageTitle(honor.name, true) !== title)
        retry.push(honor) // ask again with the shorter title
      else
        allMisses.push({
          id: honor.id,
          name: honor.name,
          reason: 'no-page',
          tried: title,
        })
    }
    return retry
  }

  const exactTitle = (h: HonorRecord) => wikiPageTitle(h.name, false) // first try
  const shortTitle = (h: HonorRecord) => wikiPageTitle(h.name, true) // fallback
  const exact = await findInsignias(
    [...new Set(wikiHonors.map(exactTitle))],
    wiki,
  ) // round 1: exact names, for every honor so shared pictures are listed in full
  const retry = settle(wikiHonors, exactTitle, exact, false) // honors to try without the variant
  const short = await findInsignias([...new Set(retry.map(shortTitle))], wiki) // round 2: shortened names
  settle(retry, shortTitle, short, true) // settle the shorter-title answers; nothing left to retry
  const misses = allMisses.filter(
    (m) => todoIds.has(m.id) || m.reason === 'fetch-failed',
  ) // saved honors report only retryable misses, so a failed lookup is never lost

  const groups = new Map<string, HonorRecord[]>() // wiki file → honors sharing it
  for (const honor of wikiHonors) {
    const file = fileOf.get(honor.id) // set when a page gave an insignia
    if (file !== undefined)
      groups.set(file, [...(groups.get(file) ?? []), honor]) // add the honor to its file group
  }
  const needed = [...groups].filter(([, group]) =>
    group.some((h) => todoIds.has(h.id)),
  ) // files with at least one honor to save
  const urls = await findPictureUrls(
    needed.map(([file]) => file),
    wiki,
  ) // download addresses
  let saved = 0 // pictures written
  for (const [file, fullGroup] of needed) {
    const group = fullGroup.filter((h) => todoIds.has(h.id)) // only honors without a picture
    const picture = urls.get(file) // address, null or fetch-failed
    if (
      picture === 'fetch-failed' ||
      picture === null ||
      picture === undefined
    ) {
      const reason =
        picture === null || picture === undefined ? 'no-file' : 'fetch-failed' // missing vs unreachable
      for (const h of group)
        misses.push({ id: h.id, name: h.name, reason, tried: file }) // report each honor of the file
      continue
    }
    let bytes: Uint8Array // the downloaded picture
    try {
      const response = await fetchWithRetry(picture.url, {
        fetchFn: deps.fetchFn,
        sleep: deps.sleep,
      })
      if (response.status === 404) {
        deps.log(`Picture missing (404) for ${group.length} honors`) // permanent, not retried
        for (const h of group)
          misses.push({
            id: h.id,
            name: h.name,
            reason: 'no-file',
            tried: file,
          })
        continue
      }
      if (!response.ok)
        throw new Error(`Picture download answered status ${response.status}`) // caught below, recorded as fetch-failed
      bytes = new Uint8Array(await response.arrayBuffer()) // already read inside the timeout
    } catch (error) {
      deps.log(
        `Download failed for ${group.length} honors: ${error instanceof Error ? error.message : String(error)}`,
      ) // urls hold file names only
      for (const h of group)
        misses.push({
          id: h.id,
          name: h.name,
          reason: 'fetch-failed',
          tried: file,
        })
      continue
    }
    for (const honor of group) {
      const final = join(deps.patchesDir, `${honor.id}.webp`) // finished picture
      const temp = `${final}.tmp` // written first, so a crash never leaves a half file under the real name
      try {
        await deps.convert(bytes, temp) // write the webp to the temp path
        renameSync(temp, final) // appears only when complete
        saved += 1 // count the picture
        deps.log(`Saved ${honor.id}`) // one id per saved picture
      } catch (error) {
        rmSync(temp, { force: true }) // no .tmp left behind
        misses.push({
          id: honor.id,
          name: honor.name,
          reason: 'convert-failed',
          tried: file,
        })
        deps.log(
          `Convert failed for ${honor.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  const shared: string[][] = [] // groups of 2 or more honors sharing a file, whenever saved
  for (const [, group] of groups) {
    const ids = group.filter(hasFile).map((h) => h.id) // honors that have the picture now
    if (ids.length > 1) shared.push(ids) // report the shared picture
  }
  return { saved, skipped, misses, shared } // the run result
}

/**
 * Phase 2: sets `image` for honors that have a picture file.
 * @param honors all honors
 * @param hasPicture true when `public/patches/<id>.webp` exists
 * @return a new array; only a `null` image changes, to `patches/<id>.webp`
 */
export function setPatchImages(
  honors: HonorRecord[],
  hasPicture: (id: string) => boolean,
): HonorRecord[] {
  return honors.map((honor) =>
    honor.image === null && hasPicture(honor.id)
      ? { ...honor, image: patchImagePath(honor.id) } // the only change
      : honor,
  )
}

/**
 * Writes the import report.
 * @param misses honors without a picture
 * @param shared groups of honors sharing one picture
 * @param date the run date, YYYY-MM-DD
 * @return Markdown text
 */
export function importReport(
  misses: PatchMiss[],
  shared: string[][],
  date: string,
): string {
  const sorted = [...misses].sort((a, b) => a.name.localeCompare(b.name)) // by honor name
  const missLines =
    sorted.length === 0
      ? ['No misses.']
      : sorted.map(
          (m) => `- \`${m.id}\` ${m.name}: ${m.reason} (tried \`${m.tried}\`)`,
        )
  const sharedLines =
    shared.length === 0
      ? ['No shared pictures in this run.']
      : shared.map((ids) => `- ${ids.map((id) => `\`${id}\``).join(', ')}`)
  return [
    '# Patch picture import report',
    '',
    `Run on ${date}. A dated record, not live data.`,
    '',
    '## Honors with no picture',
    '',
    ...missLines,
    '',
    '## Honors sharing one picture',
    '',
    ...sharedLines,
    '',
  ].join('\n')
}

/**
 * Runs both phases and writes honors.json and the report.
 * @param honorsPath the honors.json file
 * @param reportPath where the report goes
 * @param deps HTTP, converter, folder and log
 * @param date the run date for the report
 * @return exit code: 1 when any miss is retryable (fetch-failed), else 0
 */
export async function runImport(
  honorsPath: string,
  reportPath: string,
  deps: ImportDeps,
  date: string,
): Promise<number> {
  const original = readFileSync(honorsPath, 'utf8') // text before the run
  const honors: unknown = JSON.parse(original) // parsed list
  if (!Array.isArray(honors))
    throw new Error(`${honorsPath}: honors.json must be a list of honors`) // fail on bad input
  const { saved, skipped, misses, shared } = await importPatches(
    honors as HonorRecord[],
    deps,
  )
  const updated = setPatchImages(honors as HonorRecord[], (id) =>
    existsSync(join(deps.patchesDir, `${id}.webp`)),
  ) // phase 2 from the files on disk
  const text = serializeData(updated) // new file text
  if (text !== original) {
    writeFileSync(`${honorsPath}.tmp`, text) // full text first, so a crash never leaves a truncated honors.json
    renameSync(`${honorsPath}.tmp`, honorsPath) // swap in one step
  } // touch the file only when something changed
  writeFileSync(reportPath, importReport(misses, shared, date)) // the dated report
  deps.log(
    `Saved ${saved}, skipped ${skipped} (already there), ${misses.length} misses — see scripts/patches/import-report.md`,
  )
  return misses.some((m) => m.reason === 'fetch-failed') ? 1 : 0 // 1 means rerun, 0 means done
}

/** What `main` needs, all defaulting to the real command line setup. */
export type MainOptions = {
  honorsPath: string // the honors.json file
  reportPath: string // where the report goes
  deps: ImportDeps // HTTP, converter, folder and log
  checkConverter: () => Promise<void> // rejects when cwebp is missing
}

/**
 * Command line entry: checks cwebp, then imports from the real wiki, and sets the process exit code.
 * @param options paths, deps and converter check; defaults are the real ones
 * @return resolves when process.exitCode is set
 */
export async function main(options: Partial<MainOptions> = {}): Promise<void> {
  const checkConverter =
    options.checkConverter ??
    (async () => void (await run('cwebp', ['-version']))) // real check
  try {
    await checkConverter() // fail before any request when cwebp is missing
  } catch {
    console.error('Install cwebp (brew install webp)') // tell the user the one fix
    process.exitCode = 1 // nothing requested, nothing written
    return
  }
  process.exitCode = await runImport(
    options.honorsPath ?? 'public/data/honors.json',
    options.reportPath ?? 'scripts/patches/import-report.md',
    options.deps ?? {
      fetchFn: fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      convert: cwebpConvert,
      patchesDir: 'public/patches',
      log: console.log,
    },
    new Date().toISOString().slice(0, 10),
  ) // exit code from the run
}

// Run only when started from the command line, not when a test imports the functions.
if (process.argv[1] === import.meta.filename) {
  await main() // sets process.exitCode
}
