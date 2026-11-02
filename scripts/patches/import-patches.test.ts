// @vitest-environment node
// Tests for the patch picture import: resuming, conversion failures, shared pictures, misses, honors.json update and the report, against a temp folder with a fake wiki and converter.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs' // file helpers
import { tmpdir } from 'node:os' // temp folder location
import { join } from 'node:path' // path helper
import { afterEach, beforeEach, describe, expect, it } from 'vitest' // test API
import { serializeData } from '../../src/shared/data/serialize.ts' // writer used for honors.json
import type { HonorRecord } from '../../src/shared/data/types.ts' // data shape
import {
  importPatches,
  importReport,
  main,
  runImport,
  setPatchImages,
  type ImportDeps,
} from './import-patches.ts' // code under test

let dir = '' // temp folder for one test
let requests: string[] = [] // every URL the fake wiki received

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'patches-test-')) // fresh folder
  mkdirSync(join(dir, 'patches')) // where pictures go
  requests = [] // reset the request log
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true }) // clean up
})

/** Builds an honor with the given fields over test defaults. */
function honor(id: string, name: string, extra: Partial<HonorRecord> = {}): HonorRecord {
  return {
    id,
    name,
    category: 'Nature',
    skillLevel: 1,
    issuedBy: 'General Conference',
    enabled: true,
    price: 4,
    image: null,
    ...extra,
  }
}

/**
 * Builds deps with a fake wiki.
 * @param pages page title → insignia file name (null = page without insignia); absent = no page
 * @param files file name → true when the wiki has it
 * @param failConvertFor honor id whose conversion throws
 * @param pictureStatus HTTP status the picture download answers
 */
function makeDeps(
  pages: Record<string, string | null>,
  files: Record<string, boolean>,
  failConvertFor = '',
  pictureStatus = 200,
): ImportDeps {
  return {
    sleep: async () => {},
    patchesDir: join(dir, 'patches'),
    log: () => {},
    fetchFn: async (input) => {
      const url = String(input) // requested URL
      requests.push(url)
      if (!url.includes('api.php'))
        return pictureStatus === 200
          ? new Response(new Uint8Array([1, 2, 3])) // picture bytes
          : new Response('', { status: pictureStatus }) // e.g. 404
      const params = new URL(url).searchParams // query parameters
      const titles = params.get('titles')!.split('|') // titles asked
      if (params.get('prop') === 'revisions') {
        return new Response(
          JSON.stringify({
            query: {
              pages: titles.map((title) =>
                title in pages
                  ? {
                      title,
                      revisions: [
                        {
                          slots: {
                            main: {
                              content:
                                pages[title] === null
                                  ? '{{X}}'
                                  : `|insignia=${pages[title]}`,
                            },
                          },
                        },
                      ],
                    }
                  : { title, missing: true },
              ),
            },
          }),
        )
      }
      return new Response(
        JSON.stringify({
          query: {
            pages: titles.map((title) =>
              files[title.replace('File:', '')]
                ? {
                    title,
                    imageinfo: [
                      {
                        url: `https://img.test/o/${title.replace('File:', '')}`,
                        width: 400,
                        thumburl: `https://img.test/t/${title.replace('File:', '')}`,
                        thumbwidth: 200,
                      },
                    ],
                  }
                : { title, missing: true },
            ),
          },
        }),
      )
    },
    convert: async (_input, outPath) => {
      if (failConvertFor !== '' && outPath.includes(`${failConvertFor}.webp`)) {
        writeFileSync(outPath, 'partial') // a half-written output, as a crashed converter leaves
        throw new Error('cwebp failed')
      }
      writeFileSync(outPath, 'WEBP') // pretend converted picture
    },
  }
}

describe('importPatches', () => {
  // Bug caught: a rerun downloads honors that already have a picture, or reports them as misses.
  it('skips an honor whose picture exists, with no picture download and no miss', async () => {
    writeFileSync(join(dir, 'patches', 'knot-tying.webp'), 'WEBP') // already saved
    const result = await importPatches(
      [honor('knot-tying', 'Knot Tying')],
      makeDeps({}, {}),
    )
    expect(result.skipped).toBe(1)
    expect(result.saved).toBe(0)
    expect(result.misses).toEqual([])
    expect(requests.filter((url) => !url.includes('api.php'))).toEqual([])
  })

  // Bug caught: a rerun lists only the pictures saved in that run, so the shared-picture list loses honors saved earlier.
  it('lists a shared picture in full when one of its honors was saved in an earlier run', async () => {
    writeFileSync(join(dir, 'patches', 'p1.webp'), 'WEBP') // saved by an earlier run
    const deps = makeDeps(
      { 'AY Honors/P1': 'Peace.png', 'AY Honors/P2': 'Peace.png' },
      { 'Peace.png': true },
    )
    const result = await importPatches(
      [honor('p1', 'P1'), honor('p2', 'P2')],
      deps,
    )
    expect(result.saved).toBe(1)
    expect(result.shared).toEqual([['p1', 'p2']])
    expect(
      requests.filter((url) => url.startsWith('https://img.test/')),
    ).toEqual(['https://img.test/t/Peace.png'])
  })

  // Bug caught: a killed run leaves a .tmp file in the patches folder that gets committed and deployed.
  it('removes leftover .webp.tmp files at the start', async () => {
    writeFileSync(join(dir, 'patches', 'knot-tying.webp.tmp'), 'half') // left by a killed run
    await importPatches([], makeDeps({}, {}))
    expect(readdirSync(join(dir, 'patches'))).toEqual([])
  })

  // Bug caught: a page that exists without an insignia is reported as missing, and the general page's picture is used instead.
  it('reports no-insignia and does not try the shorter title', async () => {
    const deps = makeDeps(
      {
        'AY Honors/Cats (North American Division)': null,
        'AY Honors/Cats': 'Cats.png',
      },
      { 'Cats.png': true },
    )
    const result = await importPatches(
      [honor('cats-nad', 'Cats (North American Division)')],
      deps,
    )
    expect(result.misses).toEqual([
      {
        id: 'cats-nad',
        name: 'Cats (North American Division)',
        reason: 'no-insignia',
        tried: 'AY Honors/Cats (North American Division)',
      },
    ])
    expect(result.saved).toBe(0)
  })

  // Bug caught: a 404 on the picture is recorded as retryable, so every run exits 1 for a miss that cannot heal.
  it('records a picture that answers 404 as a permanent no-file miss', async () => {
    const result = await importPatches(
      [honor('a', 'A')],
      makeDeps({ 'AY Honors/A': 'A.png' }, { 'A.png': true }, '', 404),
    )
    expect(result.misses).toEqual([
      { id: 'a', name: 'A', reason: 'no-file', tried: 'A.png' },
    ])
  })

  // Bug caught: a failed conversion leaves a broken .webp or .tmp that a rerun would treat as done, or stops the run.
  it('records convert-failed, leaves no file, and continues with the next honor', async () => {
    const deps = makeDeps(
      { 'AY Honors/A': 'A.png', 'AY Honors/B': 'B.png' },
      { 'A.png': true, 'B.png': true },
      'a',
    )
    const result = await importPatches([honor('a', 'A'), honor('b', 'B')], deps)
    expect(readdirSync(join(dir, 'patches'))).toEqual(['b.webp'])
    expect(result.saved).toBe(1)
    expect(result.misses).toEqual([
      { id: 'a', name: 'A', reason: 'convert-failed', tried: 'A.png' },
    ])
  })

  // Bug caught: a picture shared by several honors is downloaded repeatedly, or an honor gets no copy.
  it('downloads a shared file once and writes it for every honor', async () => {
    const deps = makeDeps(
      {
        'AY Honors/P1': 'Peace.png',
        'AY Honors/P2': 'Peace.png',
        'AY Honors/P3': 'Peace.png',
      },
      { 'Peace.png': true },
    )
    const result = await importPatches(
      [honor('p1', 'P1'), honor('p2', 'P2'), honor('p3', 'P3')],
      deps,
    )
    expect(
      requests.filter((url) => url.startsWith('https://img.test/')),
    ).toEqual(['https://img.test/t/Peace.png'])
    expect(readdirSync(join(dir, 'patches')).sort()).toEqual([
      'p1.webp',
      'p2.webp',
      'p3.webp',
    ])
    expect(result.shared).toEqual([['p1', 'p2', 'p3']])
  })

  // Bug caught: club-added honors are looked up on the wiki and reported as misses.
  it('skips club-added honors without a request or a miss', async () => {
    const result = await importPatches(
      [honor('my-club-honor', 'My Club Honor', { issuedBy: 'Club' })],
      makeDeps({}, {}),
    )
    expect(requests).toEqual([])
    expect(result.misses).toEqual([])
    expect(result.skipped).toBe(0)
  })

  // Bug caught: regional honors never fall back to the main page.
  it('tries the title without the trailing variant when the exact page is missing', async () => {
    const deps = makeDeps(
      { 'AY Honors/Cats': 'Cats.png' },
      { 'Cats.png': true },
    )
    const result = await importPatches(
      [honor('cats-nad', 'Cats (North American Division)')],
      deps,
    )
    expect(result.saved).toBe(1)
    expect(existsSync(join(dir, 'patches', 'cats-nad.webp'))).toBe(true)
  })

  // Bug caught: the miss names the first page tried instead of the last, hiding the fallback.
  it('reports no-page with the last title tried when both pages are missing', async () => {
    const result = await importPatches(
      [honor('cats-nad', 'Cats (North American Division)')],
      makeDeps({}, {}),
    )
    expect(result.misses).toEqual([
      {
        id: 'cats-nad',
        name: 'Cats (North American Division)',
        reason: 'no-page',
        tried: 'AY Honors/Cats',
      },
    ])
  })

  // Bug caught: a missing picture file is reported as a page problem, or not reported at all.
  it('reports no-file when the insignia file is missing on the wiki', async () => {
    const result = await importPatches(
      [honor('a', 'A')],
      makeDeps({ 'AY Honors/A': 'Gone.png' }, {}),
    )
    expect(result.misses).toEqual([
      { id: 'a', name: 'A', reason: 'no-file', tried: 'Gone.png' },
    ])
  })
})

describe('setPatchImages', () => {
  // Bug caught: an honor with a downloaded picture keeps image null.
  it('sets image when the file exists and keeps null otherwise', () => {
    const result = setPatchImages(
      [honor('a', 'A'), honor('b', 'B')],
      (id) => id === 'a',
    )
    expect(result.map((h) => h.image)).toEqual(['patches/a.webp', null])
  })

  // Bug caught: an admin-chosen image is replaced by the imported one.
  it('keeps an existing non-null image', () => {
    const result = setPatchImages(
      [honor('a', 'A', { image: 'patches/custom.webp' })],
      () => true,
    )
    expect(result[0].image).toBe('patches/custom.webp')
  })

  // Bug caught: the update touches other fields or returns the same array it was given.
  it('changes only image and returns a new array', () => {
    const input = [honor('a', 'A')] // one honor
    const result = setPatchImages(input, () => true)
    expect(result).not.toBe(input)
    expect(result[0]).toEqual({ ...input[0], image: 'patches/a.webp' })
    expect(input[0].image).toBeNull()
  })

  // Bug caught: a second run changes the file again, making noisy git diffs.
  it('gives the same serialized text when run twice', () => {
    const once = setPatchImages([honor('a', 'A')], () => true)
    const twice = setPatchImages(once, () => true)
    expect(serializeData(twice)).toBe(serializeData(once))
  })
})

describe('importReport', () => {
  // Bug caught: misses lost their details or came out in file order instead of by name.
  it('lists each miss with id, name, reason and tried, sorted by name', () => {
    const text = importReport(
      [
        {
          id: 'zebra',
          name: 'Zebra',
          reason: 'no-page',
          tried: 'AY Honors/Zebra',
        },
        { id: 'ant', name: 'Ant', reason: 'no-file', tried: 'Ant.png' },
      ],
      [],
      '2026-10-28',
    )
    expect(text).toContain('2026-10-28')
    expect(text.indexOf('`ant`')).toBeLessThan(text.indexOf('`zebra`'))
    expect(text).toContain('- `ant` Ant: no-file (tried `Ant.png`)')
    expect(text).toContain('- `zebra` Zebra: no-page (tried `AY Honors/Zebra`)')
  })

  // Bug caught: an empty list shows an empty section that looks like a bug.
  it('says "No misses." when there are none', () => {
    expect(importReport([], [], '2026-10-28')).toContain('No misses.')
  })

  // Bug caught: shared pictures are not listed, so the user cannot check near-identical patches.
  it('lists shared-picture groups', () => {
    expect(importReport([], [['p1', 'p2']], '2026-10-28')).toContain(
      '- `p1`, `p2`',
    )
  })
})

describe('runImport', () => {
  /** Writes honors.json in the temp folder and returns its path. */
  function writeHonors(honors: HonorRecord[]): string {
    const path = join(dir, 'honors.json') // file under test
    writeFileSync(path, serializeData(honors))
    return path
  }

  // Bug caught: with the wiki down, the run exits 0, writes files or edits honors.json.
  it('exits 1 with every honor fetch-failed when the wiki is unreachable, changing nothing', async () => {
    const honorsPath = writeHonors([honor('a', 'A'), honor('b', 'B')])
    const before = readFileSync(honorsPath, 'utf8') // text before the run
    const deps = makeDeps({}, {})
    deps.fetchFn = async () => {
      throw new Error('network down')
    }
    const code = await runImport(
      honorsPath,
      join(dir, 'report.md'),
      deps,
      '2026-10-28',
    )
    expect(code).toBe(1)
    expect(readdirSync(join(dir, 'patches'))).toEqual([])
    expect(readFileSync(honorsPath, 'utf8')).toBe(before)
    const report = readFileSync(join(dir, 'report.md'), 'utf8') // written even when everything failed
    expect(report).toContain('- `a` A: fetch-failed')
    expect(report).toContain('- `b` B: fetch-failed')
  })

  // Bug caught: a rerun with every honor saved and a failed lookup exits 0 and writes a report without the shared group.
  it('exits 1 and reports fetch-failed when a lookup fails on a rerun where every honor is saved', async () => {
    const honorsPath = writeHonors([honor('p1', 'P1'), honor('p2', 'P2')])
    writeFileSync(join(dir, 'patches', 'p1.webp'), 'WEBP') // saved earlier
    writeFileSync(join(dir, 'patches', 'p2.webp'), 'WEBP') // saved earlier
    const deps = makeDeps({}, {})
    deps.fetchFn = async () => {
      throw new Error('network down')
    } // every lookup batch fails
    const code = await runImport(
      honorsPath,
      join(dir, 'report.md'),
      deps,
      '2026-10-28',
    )
    expect(code).toBe(1)
    const report = readFileSync(join(dir, 'report.md'), 'utf8') // rewritten after the run
    expect(report).toContain('- `p1` P1: fetch-failed')
    expect(report).toContain('- `p2` P2: fetch-failed')
  })

  // Bug caught: permanent misses make the exit code 1, so the user reruns for nothing.
  it('exits 0 when the only misses are permanent', async () => {
    const honorsPath = writeHonors([honor('a', 'A')])
    const code = await runImport(
      honorsPath,
      join(dir, 'report.md'),
      makeDeps({}, {}),
      '2026-10-28',
    )
    expect(code).toBe(0)
  })

  // Bug caught: a 404 picture makes the run exit 1 on every rerun.
  it('exits 0 when the only miss is a picture that answers 404', async () => {
    const honorsPath = writeHonors([honor('a', 'A')])
    const code = await runImport(
      honorsPath,
      join(dir, 'report.md'),
      makeDeps({ 'AY Honors/A': 'A.png' }, { 'A.png': true }, '', 404),
      '2026-10-28',
    )
    expect(code).toBe(0)
  })

  // Bug caught: a resumed run drops the earlier-saved honor from the report and from honors.json.
  it('finishes a resumed run: sets image for both honors and lists the shared picture', async () => {
    const honorsPath = writeHonors([honor('p1', 'P1'), honor('p2', 'P2')])
    writeFileSync(join(dir, 'patches', 'p1.webp'), 'WEBP') // saved before an interruption
    const code = await runImport(
      honorsPath,
      join(dir, 'report.md'),
      makeDeps(
        { 'AY Honors/P1': 'Peace.png', 'AY Honors/P2': 'Peace.png' },
        { 'Peace.png': true },
      ),
      '2026-10-28',
    )
    expect(code).toBe(0)
    const saved = JSON.parse(readFileSync(honorsPath, 'utf8')) as HonorRecord[] // file after the run
    expect(saved.map((h) => h.image)).toEqual([
      'patches/p1.webp',
      'patches/p2.webp',
    ])
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toContain(
      '- `p1`, `p2`',
    )
  })

  // Bug caught: a crash while writing honors.json leaves a truncated file, because it is written in place.
  it('replaces honors.json through a temp file, leaving none behind', async () => {
    const honorsPath = writeHonors([honor('a', 'A')])
    const before = statSync(honorsPath).ino // a rename gives the file a new inode
    await runImport(
      honorsPath,
      join(dir, 'report.md'),
      makeDeps({ 'AY Honors/A': 'A.png' }, { 'A.png': true }),
      '2026-10-28',
    )
    expect(statSync(honorsPath).ino).not.toBe(before)
    expect(existsSync(`${honorsPath}.tmp`)).toBe(false)
  })

  // Bug caught: pictures are saved but honors.json is not updated, or other honors change.
  it('sets image for saved honors and leaves the rest', async () => {
    const honorsPath = writeHonors([honor('a', 'A'), honor('b', 'B')])
    const code = await runImport(
      honorsPath,
      join(dir, 'report.md'),
      makeDeps({ 'AY Honors/A': 'A.png' }, { 'A.png': true }),
      '2026-10-28',
    )
    expect(code).toBe(0)
    const saved = JSON.parse(readFileSync(honorsPath, 'utf8')) as HonorRecord[] // file after the run
    expect(saved.map((h) => h.image)).toEqual(['patches/a.webp', null])
  })

  // Bug caught: a malformed honors.json crashes with a cryptic error or is overwritten.
  it('throws a clear error when honors.json is not a list', async () => {
    const path = join(dir, 'honors.json') // bad file
    writeFileSync(path, '{"a":1}')
    await expect(
      runImport(path, join(dir, 'report.md'), makeDeps({}, {}), '2026-10-28'),
    ).rejects.toThrow('honors.json must be a list of honors')
  })
})

describe('main', () => {
  /** Runs main against the temp folder with the given fake wiki deps. */
  async function runMain(
    deps: ImportDeps,
    checkConverter: () => Promise<void> = async () => {},
  ): Promise<void> {
    const honorsPath = join(dir, 'honors.json') // file under test
    writeFileSync(honorsPath, serializeData([honor('a', 'A')]))
    await main({
      honorsPath,
      reportPath: join(dir, 'report.md'),
      deps,
      checkConverter,
    })
  }

  // Bug caught: a retryable miss leaves the process exit code at 0, so a script chain thinks the import finished.
  it('sets process.exitCode to 1 when the wiki is unreachable', async () => {
    const deps = makeDeps({}, {})
    deps.fetchFn = async () => {
      throw new Error('network down')
    }
    try {
      await runMain(deps)
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = undefined // do not fail the test run itself
    }
  })

  // Bug caught: a missing cwebp is found only after requests were made, or exits 0.
  it('sets process.exitCode to 1 and makes no request when cwebp is missing', async () => {
    try {
      await runMain(makeDeps({}, {}), async () => {
        throw new Error('cwebp not found')
      })
      expect(process.exitCode).toBe(1)
      expect(requests).toEqual([])
    } finally {
      process.exitCode = undefined // do not fail the test run itself
    }
  })

  // Bug caught: a clean run leaves a non-zero exit code.
  it('leaves process.exitCode at 0 for a clean run', async () => {
    try {
      await runMain(makeDeps({ 'AY Honors/A': 'A.png' }, { 'A.png': true }))
      expect(process.exitCode).toBe(0)
    } finally {
      process.exitCode = undefined // do not fail the test run itself
    }
  })
})
