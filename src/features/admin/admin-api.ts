// The admin page's calls to the Admin Worker: load a page of items, load the meta, save changes, add and delete, each answer reduced to a kind the screen can act on.

import type {
  AdminHonor,
  AdminMeta,
  DeleteRequest,
  HonorChange,
  NewItem,
} from '../../../workers/admin/src/admin-types.ts' // the shared shapes

// The three sorts the Worker offers.
export type ItemSort = 'changed' | 'newest' | 'name'
// What one page request asks.
export type PageRequest = {
  sort: ItemSort // the order
  q: string // search words, empty for none
  category: string | null // one category, null for all
  cursor: string | null // the Worker's cursor, null for the first page
  signal?: AbortSignal // aborts a request a newer one replaces
}
// The result of loading a page.
export type LoadPageResult =
  | { kind: 'ok'; honors: AdminHonor[]; nextCursor: string | null }
  | { kind: 'signed-out' }
  | { kind: 'error' }
// The result of loading the meta.
export type LoadMetaResult =
  { kind: 'ok'; meta: AdminMeta } | { kind: 'signed-out' } | { kind: 'error' }
// The result of sending changes.
export type SendResult =
  | { kind: 'saved'; honors: AdminHonor[] }
  | { kind: 'conflict'; honors: AdminHonor[]; deletedIds: string[] }
  | { kind: 'name-taken'; ids: string[] }
  | { kind: 'signed-out' }
  | { kind: 'error' }
// The result of adding an item.
export type AddResult =
  | { kind: 'added'; honor: AdminHonor }
  | { kind: 'name-taken' | 'id-taken' | 'signed-out' | 'error' }
// The result of uploading a picture.
export type PictureResult =
  | { kind: 'saved'; honor: AdminHonor }
  | { kind: 'conflict'; honors: AdminHonor[]; deletedIds: string[] }
  | { kind: 'signed-out' | 'error' }
// The result of deleting an item.
export type DeleteResult =
  | { kind: 'deleted'; deletedId: string }
  | { kind: 'conflict'; honors: AdminHonor[] }
  | { kind: 'built-in' | 'signed-out' | 'error' }

/**
 * Checks one value is a row of the Worker's list.
 * @param value anything
 * @return true for an object with every field in the right type
 */
function isAdminHonor(value: unknown): value is AdminHonor {
  if (typeof value !== 'object' || value === null) return false // not an object
  const row = value as Record<string, unknown> // read by field
  return (
    typeof row.id === 'string' && // the id
    typeof row.name === 'string' && // the name
    typeof row.category === 'string' && // the category
    (row.image === null || typeof row.image === 'string') && // an R2 key or none
    (row.status === 'active' || row.status === 'hidden') && // the status
    Number.isInteger(row.stock) && // a whole number, never text
    Number.isInteger(row.priceCents) && // whole cents
    typeof row.clubAdded === 'boolean' && // Club-added or built in
    typeof row.createdAt === 'string' && // an ISO time
    typeof row.modifiedAt === 'string' // an ISO time
  )
}

/**
 * Checks a value is a list of rows.
 * @param value anything
 * @return true when every entry is a row
 */
const isHonorList = (value: unknown): value is AdminHonor[] =>
  Array.isArray(value) && value.every(isAdminHonor) // an array of rows

/**
 * Checks a value is a list of texts.
 * @param value anything
 * @return true for an array of strings
 */
const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') // strings only

/**
 * Reads a field of an unknown answer.
 * @param body the parsed answer
 * @param key the field
 * @return the field's value, or undefined when the answer is not an object
 */
const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)[key]
    : undefined // one level only

/**
 * Tells whether an answer means the Access session has gone.
 * @param response the answer
 * @return true for a blocked redirect (an Access login) or a 403
 */
const isSignedOut = (response: Response): boolean =>
  response.type === 'opaqueredirect' || response.status === 403 // both mean "sign in again"

/**
 * Sends a request without following an Access redirect and reads the JSON answer.
 * @param path the Worker route
 * @param init the extra fetch options
 * @return the status and parsed body, `signed-out`, or null for a network failure
 */
async function call(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown } | 'signed-out' | null> {
  try {
    const response = await fetch(path, {
      redirect: 'manual',
      credentials: 'same-origin',
      ...init,
    }) // never follow an Access redirect
    if (isSignedOut(response)) return 'signed-out' // the session ended
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    } // the answer, if it is JSON
  } catch {
    return null // a network failure or an aborted request
  }
}

/**
 * Sends a JSON write.
 * @param path the Worker route
 * @param body the JSON body
 * @return as `call`
 */
const post = (path: string, body: unknown) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) // the Worker refuses anything but JSON

/**
 * Loads one page of items.
 * @param request the sort, search, category and cursor
 * @return the page, signed-out, or error
 */
export async function loadItemPage(
  request: PageRequest,
): Promise<LoadPageResult> {
  const query = new URLSearchParams({ sort: request.sort }) // the sort always goes
  if (request.q !== '') query.set('q', request.q) // an empty search is left out
  if (request.category !== null) query.set('category', request.category) // all categories is left out
  if (request.cursor !== null) query.set('cursor', request.cursor) // the first page has none
  const answer = await call(`/api/items?${query}`, { signal: request.signal }) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null || answer.status !== 200) return { kind: 'error' } // the Worker or the network failed
  const honors = field(answer.body, 'honors') // the rows
  const nextCursor = field(answer.body, 'nextCursor') // where the next page starts
  if (
    !isHonorList(honors) ||
    (typeof nextCursor !== 'string' && nextCursor !== null)
  )
    return { kind: 'error' } // a wrong shape is an error
  return { kind: 'ok', honors, nextCursor } // the page
}

/**
 * Loads the currency, default price and category list.
 * @return the meta, signed-out, or error
 */
export async function loadMeta(): Promise<LoadMetaResult> {
  const answer = await call('/api/meta') // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null || answer.status !== 200) return { kind: 'error' } // failed
  const body = answer.body // what came back
  if (
    typeof field(body, 'currency') !== 'string' ||
    !Number.isInteger(field(body, 'defaultPriceCents')) ||
    !isTextList(field(body, 'categories'))
  )
    return { kind: 'error' } // a wrong shape is an error
  return { kind: 'ok', meta: body as AdminMeta } // checked above
}

/**
 * Sends the changes in one save.
 * @param changes the changes, each with its `from` and `to`
 * @return saved rows, a conflict, a taken name, signed-out, or error
 */
export async function sendHonorChanges(
  changes: HonorChange[],
): Promise<SendResult> {
  const answer = await post('/api/items/changes', { changes }) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null) return { kind: 'error' } // the network failed
  const honors = field(answer.body, 'honors') // the rows it carries
  if (answer.status === 200 && isHonorList(honors))
    return { kind: 'saved', honors } // written
  if (
    answer.status === 409 &&
    field(answer.body, 'error') === 'name-taken' &&
    isTextList(field(answer.body, 'ids'))
  )
    return { kind: 'name-taken', ids: field(answer.body, 'ids') as string[] } // nothing written
  if (
    answer.status === 409 &&
    isHonorList(honors) &&
    isTextList(field(answer.body, 'deletedIds'))
  )
    return {
      kind: 'conflict',
      honors,
      deletedIds: field(answer.body, 'deletedIds') as string[],
    } // nothing written
  return { kind: 'error' } // anything else
}

/**
 * Adds an item; it is saved at once.
 * @param item the name, category and price
 * @return the added row, a refusal kind, signed-out, or error
 */
export async function addItem(item: NewItem): Promise<AddResult> {
  const answer = await post('/api/items', item) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null) return { kind: 'error' } // the network failed
  const honor = field(answer.body, 'honor') // the new row
  if (answer.status === 201 && isAdminHonor(honor))
    return { kind: 'added', honor } // created
  const code = field(answer.body, 'error') // the Worker's code
  if (answer.status === 409 && (code === 'name-taken' || code === 'id-taken'))
    return { kind: code } // the two refusals
  return { kind: 'error' } // anything else
}

/**
 * Deletes a Club-added item the admin saw unchanged.
 * @param request the id and the row as seen
 * @return deleted, a conflict with the current row, built-in, signed-out, or error
 */
export async function deleteItem(
  request: DeleteRequest,
): Promise<DeleteResult> {
  const answer = await post('/api/items/delete', request) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null) return { kind: 'error' } // the network failed
  const deletedId = field(answer.body, 'deletedId') // the id on success
  const honors = field(answer.body, 'honors') // the current rows on a conflict
  if (answer.status === 200 && typeof deletedId === 'string')
    return { kind: 'deleted', deletedId } // gone
  if (answer.status === 409 && isHonorList(honors))
    return { kind: 'conflict', honors } // changed since viewing
  if (answer.status === 400 && field(answer.body, 'error') === 'built-in')
    return { kind: 'built-in' } // never deleted
  return { kind: 'error' } // anything else
}

/**
 * Uploads an item's new picture; it is live at once.
 * @param id the item's id
 * @param seen the picture key the admin saw, null when the item had none
 * @param picture the resized picture, WebP or PNG
 * @return the saved row, a conflict with the current rows, signed-out, or error
 */
export async function uploadPicture(
  id: string,
  seen: string | null,
  picture: Blob,
): Promise<PictureResult> {
  const query = new URLSearchParams({ id, seen: seen ?? '' }) // an empty seen means no picture
  const answer = await call(`/api/items/picture?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': picture.type },
    body: picture,
  }) // the bytes, typed as the Worker expects
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null) return { kind: 'error' } // the network failed
  const honor = field(answer.body, 'honor') // the saved row
  if (answer.status === 200 && isAdminHonor(honor)) return { kind: 'saved', honor } // stored
  const honors = field(answer.body, 'honors') // the current rows on a conflict
  const deletedIds = field(answer.body, 'deletedIds') // the ids another admin deleted
  if (answer.status === 409 && isHonorList(honors) && isTextList(deletedIds))
    return { kind: 'conflict', honors, deletedIds } // nothing stored
  return { kind: 'error' } // anything else
}
