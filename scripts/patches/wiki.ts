// Pathfinder Wiki client for the patch picture import: page lookups in batches, `insignia=` parsing, picture URLs and retrying requests.
// Kept apart from the command so it can be tested with a fake `fetch`.

const apiUrl = 'https://wiki.pathfindersonline.org/api.php' // the wiki's API
const batchSize = 50 // titles the API accepts per request
const userAgent =
  'pem-pf-store one-time patch import (https://github.com/kiostz/pem-pf-store)' // names the store to the wiki's admins

/** What the lookups need from the outside: HTTP, waiting and optional logging. */
export type WikiDeps = {
  fetchFn: typeof fetch // the HTTP call
  sleep: (ms: number) => Promise<void> // waits between retries
  log?: (line: string) => void // progress and failure lines (counts only)
}

/** Options of {@link fetchWithRetry}; every field has a default. */
export type RetryOptions = {
  attempts?: number // total tries, default 4
  timeoutMs?: number // per request, default 30000
  waitsMs?: number[] // waits before tries 2, 3, 4; default 2 s, 4 s, 8 s
  fetchFn?: typeof fetch // default global fetch
  sleep?: (ms: number) => Promise<void> // default real timer
}

/**
 * Builds the wiki page title of an honor.
 * @param name the honor's display name
 * @param dropVariant true to remove a trailing " (…)" first
 * @return `AY Honors/<name>`
 */
export function wikiPageTitle(name: string, dropVariant: boolean): string {
  const base = dropVariant ? name.replace(/\s*\([^)]*\)\s*$/, '') : name // "Cats (X)" → "Cats"
  return `AY Honors/${base}` // the wiki's honor page prefix
}

/**
 * Reads the picture file name from an honor page's wikitext.
 * @param text the page's wikitext
 * @return the trimmed `insignia=` value, or null when absent or empty
 */
export function insigniaFromWikitext(text: string): string | null {
  const match = /\|\s*insignia\s*=([^|\n\r]*)/.exec(text) // value ends at a pipe or line end
  const value = match?.[1].trim() ?? '' // '' when the field is missing
  return value === '' ? null : value // empty counts as absent
}

/**
 * Fetches a URL, retrying network errors, timeouts, 429 and 5xx.
 * @param url the address to fetch
 * @param options attempts, timeout, waits and the HTTP and sleep functions
 * @return the response with its body already read inside the timeout; a 404 or any other non-retryable status comes back at once
 */
export async function fetchWithRetry(
  url: string,
  options: RetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 4 // total tries
  const timeoutMs = options.timeoutMs ?? 30000 // per request
  const waitsMs = options.waitsMs ?? [2000, 4000, 8000] // before tries 2, 3, 4
  const fetchFn = options.fetchFn ?? fetch // HTTP call
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))) // real wait
  let lastProblem = '' // why the last try failed
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController() // cancels a slow request
    const timer = setTimeout(() => controller.abort(), timeoutMs) // timeout
    try {
      const response = await fetchFn(url, {
        signal: controller.signal,
        headers: { 'User-Agent': userAgent },
      })
      if (response.status !== 429 && response.status < 500) {
        const body = await response.arrayBuffer() // read under the same timeout, so a stalled body is retried too
        return new Response(body.byteLength === 0 ? null : body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }) // final answer, 404 included
      }
      lastProblem = `status ${response.status}` // retryable
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error) // network error or abort
    } finally {
      clearTimeout(timer) // never leave the timer running
    }
    if (attempt < attempts) await sleep(waitsMs[attempt - 1] ?? 8000) // wait before the next try
  }
  throw new Error(
    `Request failed after ${attempts} attempts (${lastProblem}): ${url}`,
  )
}

/** The parts of an API page this script reads. */
type ApiPage = {
  title: string // page title as the wiki answers it
  missing?: boolean // true when no such page
  revisions?: { slots?: { main?: { content?: string } } }[] // wikitext, when asked for
  imageinfo?: {
    url: string // original file address
    width: number // original width in px
    thumburl?: string // address of the resized copy
    thumbwidth?: number // width of the resized copy
  }[] // file details, when asked for
}

/** The API answer shape for `action=query` with `formatversion=2`. */
type ApiAnswer = {
  query?: {
    normalized?: { from: string; to: string }[] // title cleaned up by the wiki
    redirects?: { from: string; to: string }[] // redirect followed by the wiki
    pages?: ApiPage[] // one entry per title
  } // absent on an error answer
}

/**
 * Looks titles up in batches of 50, mapping answers back to the titles asked.
 * @param titles titles to ask for
 * @param params extra API parameters (the property to read)
 * @param deps HTTP, sleep and log
 * @return per title: its page, null when missing, 'fetch-failed' when its batch failed every attempt
 */
async function lookupPages(
  titles: string[],
  params: Record<string, string>,
  deps: WikiDeps,
): Promise<Map<string, ApiPage | null | 'fetch-failed'>> {
  const result = new Map<string, ApiPage | null | 'fetch-failed'>() // answer per title asked
  for (let start = 0; start < titles.length; start += batchSize) {
    const batch = titles.slice(start, start + batchSize) // up to 50 titles
    const query = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      titles: batch.join('|'),
      ...params,
    }) // request parameters
    try {
      const response = await fetchWithRetry(`${apiUrl}?${query}`, {
        fetchFn: deps.fetchFn,
        sleep: deps.sleep,
      })
      if (!response.ok)
        throw new Error(`Wiki answered status ${response.status}`) // e.g. 404 on the API itself
      const answer = (await response.json()) as ApiAnswer // parsed body
      if (!Array.isArray(answer.query?.pages))
        throw new Error('Wiki answer has no query.pages list') // unexpected format
      const renamed = new Map<string, string>() // title asked → title in the answer
      for (const step of [
        ...(answer.query.normalized ?? []),
        ...(answer.query.redirects ?? []),
      ]) {
        renamed.set(step.from, step.to) // follow normalized, then redirects
      }
      const pages = new Map(
        answer.query.pages.map((page) => [page.title, page]),
      ) // answer by title
      for (const title of batch) {
        let current = title // follow the rename chain
        for (let hop = 0; hop < 5 && renamed.has(current); hop++)
          current = renamed.get(current)! // next name in the chain
        const page = pages.get(current) // the page, if the wiki answered for it
        result.set(title, page === undefined || page.missing ? null : page) // a missing page is null
      }
    } catch (error) {
      deps.log?.(
        `Wiki request failed for ${batch.length} titles: ${error instanceof Error ? error.message : String(error)}`,
      ) // titles are honor names, not buyer data
      for (const title of batch) result.set(title, 'fetch-failed') // only this batch
    }
  }
  return result // answers per asked title
}

/**
 * Finds the picture file name of each honor page.
 * @param titles page titles (`AY Honors/<name>`)
 * @param deps HTTP, sleep and log
 * @return per title asked: the `insignia=` file name, null when no page, 'no-insignia' when the page has none, 'fetch-failed' when the request failed
 */
export async function findInsignias(
  titles: string[],
  deps: WikiDeps,
): Promise<Map<string, string | null | 'no-insignia' | 'fetch-failed'>> {
  const pages = await lookupPages(
    titles,
    { prop: 'revisions', rvprop: 'content', rvslots: 'main' },
    deps,
  ) // page per title
  const result = new Map<
    string,
    string | null | 'no-insignia' | 'fetch-failed'
  >() // insignia per title
  for (const [title, page] of pages) {
    if (page === null || page === 'fetch-failed') {
      result.set(title, page) // no page, or the request failed
    } else {
      result.set(
        title,
        insigniaFromWikitext(page.revisions?.[0]?.slots?.main?.content ?? '') ??
          'no-insignia',
      ) // the page exists, so null becomes no-insignia
    }
  }
  return result // answers per asked title
}

/**
 * Finds the download address of each picture file.
 * @param files file names as `insignia=` gives them (no `File:` prefix)
 * @param deps HTTP, sleep and log
 * @return per file: the 200 px rendition (or the original when narrower than 200 px) and its width, null when the file is missing, 'fetch-failed' when the request failed
 */
export async function findPictureUrls(
  files: string[],
  deps: WikiDeps,
): Promise<
  Map<string, { url: string; width: number } | null | 'fetch-failed'>
> {
  const pages = await lookupPages(
    files.map((file) => `File:${file}`),
    { prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '200' },
    deps,
  ) // page per file title
  const result = new Map<
    string,
    { url: string; width: number } | null | 'fetch-failed'
  >() // picture per file
  for (const file of files) {
    const page = pages.get(`File:${file}`) // lookup result
    const info =
      page === null || page === 'fetch-failed'
        ? undefined
        : page?.imageinfo?.[0] // image details
    if (page === 'fetch-failed')
      result.set(file, page) // failed lookup stays retryable
    else if (info === undefined)
      result.set(file, null) // missing file or no image info
    else if (info.width < 200 || info.thumburl === undefined)
      result.set(file, { url: info.url, width: info.width }) // never upscale
    else result.set(file, { url: info.thumburl, width: info.thumbwidth ?? 200 }) // the wiki's 200 px copy
  }
  return result // answers per asked file
}
