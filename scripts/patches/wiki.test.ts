// @vitest-environment node
// Tests for the Pathfinder Wiki client: title and wikitext rules, batched lookups and retrying, with fetch faked at the HTTP boundary.

import { describe, expect, it } from 'vitest' // test API
import {
  fetchWithRetry,
  findInsignias,
  findPictureUrls,
  insigniaFromWikitext,
  wikiPageTitle,
} from './wiki.ts' // code under test

const noSleep = async () => {} // sleep that returns at once

/** Builds a JSON response like the wiki's API. */
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 }) // 200 with a JSON body
}

describe('insigniaFromWikitext', () => {
  // Bug caught: the file name is cut or padded, so the picture lookup misses.
  it('reads the insignia value', () => {
    expect(
      insigniaFromWikitext(
        '{{HonorLanding\n|name=X\n|insignia=ADRA Community Assessment AY Honor.png\n|level=1}}',
      ),
    ).toBe('ADRA Community Assessment AY Honor.png')
  })

  // Bug caught: wikitext written with spaces around the equals sign is not recognised.
  it('tolerates spaces around the equals sign', () => {
    expect(insigniaFromWikitext('| insignia = Knot Tying AY Honor.png ')).toBe(
      'Knot Tying AY Honor.png',
    )
  })

  // Bug caught: the value swallows the next template field on the same line.
  it('stops at a pipe', () => {
    expect(insigniaFromWikitext('|insignia=A.png|level=2')).toBe('A.png')
  })

  // Bug caught: a missing or empty field returns an empty string that is later fetched as a file.
  it('returns null when the field is missing or empty', () => {
    expect(insigniaFromWikitext('{{HonorLanding|name=X}}')).toBeNull()
    expect(insigniaFromWikitext('|insignia=\n|level=1')).toBeNull()
  })
})

describe('wikiPageTitle', () => {
  // Bug caught: wrong page prefix, so no honor is found.
  it('prefixes the honor name', () => {
    expect(wikiPageTitle('Knot Tying', false)).toBe('AY Honors/Knot Tying')
  })

  // Bug caught: the variant stays in the title, so regional honors miss the main page.
  it('drops a trailing variant on request', () => {
    expect(wikiPageTitle('Cats (North American Division)', true)).toBe(
      'AY Honors/Cats',
    )
    expect(wikiPageTitle('Cats (North American Division)', false)).toBe(
      'AY Honors/Cats (North American Division)',
    )
  })

  // Bug caught: names without a bracket, or with a comma, get mangled by the fallback.
  it('leaves names without a trailing variant unchanged', () => {
    expect(wikiPageTitle('Knot Tying', true)).toBe('AY Honors/Knot Tying')
    expect(wikiPageTitle('First Aid, Advanced', true)).toBe(
      'AY Honors/First Aid, Advanced',
    )
  })
})

describe('fetchWithRetry', () => {
  // Bug caught: a timeout aborts the whole import instead of being retried with the 2 s, 4 s waits.
  it('retries two timeouts, waiting 2 s then 4 s, and returns the third answer', async () => {
    let calls = 0 // requests made
    const waits: number[] = [] // sleeps requested
    const response = await fetchWithRetry('https://x.test/a', {
      fetchFn: async () => {
        calls += 1 // count the request
        if (calls < 3) throw new Error('timeout') // first two fail
        return new Response('ok', { status: 200 }) // third answers
      },
      sleep: async (ms) => {
        waits.push(ms) // record the wait
      },
    })
    expect(response.status).toBe(200)
    expect(calls).toBe(3)
    expect(waits).toEqual([2000, 4000])
  })

  // Bug caught: a wiki outage (5xx) is treated as a final answer.
  it('retries a 503', async () => {
    let calls = 0 // requests made
    const response = await fetchWithRetry('https://x.test/a', {
      fetchFn: async () => {
        calls += 1 // count the request
        return new Response('', { status: calls === 1 ? 503 : 200 }) // fails once
      },
      sleep: noSleep,
    })
    expect(response.status).toBe(200)
    expect(calls).toBe(2)
  })

  // Bug caught: a missing page is retried 4 times, slowing the run and hammering the wiki.
  it('returns a 404 at once', async () => {
    let calls = 0 // requests made
    const response = await fetchWithRetry('https://x.test/a', {
      fetchFn: async () => {
        calls += 1 // count the request
        return new Response('', { status: 404 }) // not found
      },
      sleep: noSleep,
    })
    expect(response.status).toBe(404)
    expect(calls).toBe(1)
  })

  // Bug caught: the error after the last attempt does not say which request failed.
  it('throws naming the URL after 4 failures', async () => {
    let calls = 0 // requests made
    await expect(
      fetchWithRetry('https://x.test/a?b=1', {
        fetchFn: async () => {
          calls += 1 // count the request
          return new Response('', { status: 500 }) // always fails
        },
        sleep: noSleep,
      }),
    ).rejects.toThrow('https://x.test/a?b=1')
    expect(calls).toBe(4)
  })

  // Bug caught: a hung request never ends because the timeout is not applied.
  it('aborts a request after timeoutMs', async () => {
    let aborted = false // true once the signal fired
    await expect(
      fetchWithRetry('https://x.test/hang', {
        attempts: 1,
        timeoutMs: 20,
        sleep: noSleep,
        fetchFn: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true // the timeout fired
              reject(new Error('aborted'))
            })
          }),
      }),
    ).rejects.toThrow('https://x.test/hang')
    expect(aborted).toBe(true)
  })

  // Bug caught: a wiki that sends headers and then stalls hangs the run, because the timeout stops at the headers.
  it('aborts when the body stalls after the headers', async () => {
    await expect(
      fetchWithRetry('https://x.test/stall', {
        attempts: 1,
        timeoutMs: 50,
        sleep: noSleep,
        fetchFn: async (_url, init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener('abort', () =>
                  controller.error(new Error('aborted')),
                ) // the body ends only when the timeout fires
              },
            }),
            { status: 200 },
          ),
      }),
    ).rejects.toThrow('https://x.test/stall')
  })

  // Bug caught: the User-Agent points at a repository that does not exist, so wiki admins cannot reach the store.
  it('sends a User-Agent naming the real repository', async () => {
    let agent = '' // header the fake wiki received
    await fetchWithRetry('https://x.test/a', {
      sleep: noSleep,
      fetchFn: async (_url, init) => {
        agent = (init?.headers as Record<string, string>)['User-Agent']
        return new Response('ok')
      },
    })
    expect(agent).toContain(
      'https://github.com/kiostz/pem-pf-store',
    )
  })
})

describe('findInsignias', () => {
  // Bug caught: more than 50 titles per request, which the wiki refuses.
  it('asks for at most 50 titles per request', async () => {
    const titles = Array.from({ length: 120 }, (_, i) => `AY Honors/H${i}`) // 120 titles
    const sizes: number[] = [] // titles per request
    const result = await findInsignias(titles, {
      sleep: noSleep,
      fetchFn: async (url) => {
        const asked = new URL(String(url)).searchParams
          .get('titles')!
          .split('|') // titles in this request
        sizes.push(asked.length)
        return json({
          query: {
            pages: asked.map((title) => ({
              title,
              revisions: [
                { slots: { main: { content: `|insignia=${title}.png` } } },
              ],
            })),
          },
        })
      },
    })
    expect(sizes).toEqual([50, 50, 20])
    expect(result.size).toBe(120)
    expect(result.get('AY Honors/H7')).toBe('AY Honors/H7.png')
  })

  // Bug caught: redirected or normalized pages are lost because the answer comes under another title.
  it('maps normalized and redirected titles back to the title asked', async () => {
    const result = await findInsignias(
      ['AY Honors/knot_tying', 'AY Honors/Cats (NAD)'],
      {
        sleep: noSleep,
        fetchFn: async () =>
          json({
            query: {
              normalized: [
                { from: 'AY Honors/knot_tying', to: 'AY Honors/Knot tying' },
              ],
              redirects: [
                { from: 'AY Honors/Cats (NAD)', to: 'AY Honors/Cats' },
              ],
              pages: [
                {
                  title: 'AY Honors/Knot tying',
                  revisions: [
                    { slots: { main: { content: '|insignia=K.png' } } },
                  ],
                },
                {
                  title: 'AY Honors/Cats',
                  revisions: [
                    { slots: { main: { content: '|insignia=C.png' } } },
                  ],
                },
              ],
            },
          }),
      },
    )
    expect(result.get('AY Honors/knot_tying')).toBe('K.png')
    expect(result.get('AY Honors/Cats (NAD)')).toBe('C.png')
  })

  // Bug caught: a page that exists without an insignia is reported like a missing page.
  it('gives null for a missing page and no-insignia for a page without insignia', async () => {
    const result = await findInsignias(['AY Honors/Nope', 'AY Honors/Bare'], {
      sleep: noSleep,
      fetchFn: async () =>
        json({
          query: {
            pages: [
              { title: 'AY Honors/Nope', missing: true },
              {
                title: 'AY Honors/Bare',
                revisions: [
                  { slots: { main: { content: '{{HonorLanding}}' } } },
                ],
              },
            ],
          },
        }),
    })
    expect(result.get('AY Honors/Nope')).toBeNull()
    expect(result.get('AY Honors/Bare')).toBe('no-insignia')
  })

  // Bug caught: one failing batch marks every honor failed, or a failure is silently read as "no page".
  it('marks only the failing batch as fetch-failed', async () => {
    const titles = Array.from({ length: 60 }, (_, i) => `AY Honors/H${i}`) // two batches: 50 and 10
    let batch = 0 // batches started
    const result = await findInsignias(titles, {
      sleep: noSleep,
      fetchFn: async (url) => {
        const asked = new URL(String(url)).searchParams
          .get('titles')!
          .split('|') // this request's titles
        if (asked[0] === 'AY Honors/H0')
          return new Response('', { status: 500 }) // first batch always fails
        batch += 1
        return json({
          query: { pages: asked.map((title) => ({ title, missing: true })) },
        })
      },
    })
    expect(batch).toBe(1)
    expect(result.get('AY Honors/H0')).toBe('fetch-failed')
    expect(result.get('AY Honors/H49')).toBe('fetch-failed')
    expect(result.get('AY Honors/H50')).toBeNull()
  })
})

describe('findPictureUrls', () => {
  /** Fake wiki answering imageinfo for the given pages. */
  const answer = (pages: unknown[]) => async () => json({ query: { pages } }) // one fixed answer

  // Bug caught: the full-size original is downloaded instead of the wiki's 200 px rendition.
  it('uses the 200 px rendition', async () => {
    const result = await findPictureUrls(['A.png'], {
      sleep: noSleep,
      fetchFn: answer([
        {
          title: 'File:A.png',
          imageinfo: [
            {
              url: 'https://w/orig.png',
              width: 600,
              thumburl: 'https://w/thumb200.png',
              thumbwidth: 200,
            },
          ],
        },
      ]),
    })
    expect(result.get('A.png')).toEqual({
      url: 'https://w/thumb200.png',
      width: 200,
    })
  })

  // Bug caught: a small original is upscaled to 200 px and looks blurry.
  it('keeps the original when it is narrower than 200 px', async () => {
    const result = await findPictureUrls(['S.png'], {
      sleep: noSleep,
      fetchFn: answer([
        {
          title: 'File:S.png',
          imageinfo: [
            {
              url: 'https://w/small.png',
              width: 150,
              thumburl: 'https://w/thumb200.png',
              thumbwidth: 200,
            },
          ],
        },
      ]),
    })
    expect(result.get('S.png')).toEqual({
      url: 'https://w/small.png',
      width: 150,
    })
  })

  // Bug caught: a missing file is treated as a download failure and retried forever.
  it('gives null for a missing file', async () => {
    const result = await findPictureUrls(['Gone.png'], {
      sleep: noSleep,
      fetchFn: answer([{ title: 'File:Gone.png', missing: true }]),
    })
    expect(result.get('Gone.png')).toBeNull()
  })
})
