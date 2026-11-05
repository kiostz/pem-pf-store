// The admin page's calls to the Admin Worker: load a page of items, load the meta, save changes, add and delete, each answer reduced to a kind the screen can act on.

import type {
  AdminClub,
  AdminHonor,
  AdminMeta,
  AdminOrder,
  ClubEdit,
  ClubFields,
  ClubOrder,
  ClubRemove,
  DeleteRequest,
  HonorChange,
  NewItem,
  OrderStep,
  StepChange,
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
const post = (path: string, body: unknown, signal?: AbortSignal) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal, // only a club write sets one
  }) // the Worker refuses anything but JSON

const CLUB_WRITE_TIMEOUT_MS = 15_000 // how long a club write may wait for its answer

/**
 * Sends a club write that gives up after 15 s, so the sheet that waits for it can close again.
 * @param path the Worker route
 * @param body the JSON body
 * @return as `call`; null (the failure line) when the time ran out
 */
async function postClub(path: string, body: unknown) {
  const controller = new AbortController() // stops the request
  const timer = setTimeout(() => controller.abort(), CLUB_WRITE_TIMEOUT_MS) // the limit
  try {
    return await post(path, body, controller.signal) // the request
  } finally {
    clearTimeout(timer) // answered or failed in time
  }
}

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

// The 403 line the order and settings screens share.
export const SIGNED_OUT_NOTE =
  'Your sign-in has ended. Open this page in a new tab to sign in, then try again.'

// The order number's shape: PF, a date, and four characters without 0, O, 1, I or L (the Worker's alphabet).
const ORDER_NUMBER = /^PF-\d{8}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/
const STEPS: readonly string[] = ['new', 'paid', 'handed_out', 'cancelled'] // every step

/**
 * Checks a typed text is an order number.
 * @param text the text, already upper-cased
 * @return true for a well-formed number
 */
export const isOrderNumber = (text: string): boolean => ORDER_NUMBER.test(text) // the Worker's pattern

// What one order page request asks.
export type OrderPageRequest = {
  step: OrderStep | null // one step, null for all
  number: string | null // one order number, null for the list
  cursor: string | null // the Worker's cursor, null for the first page
  signal?: AbortSignal // aborts a request a newer one replaces
}
// The result of loading an order page.
export type LoadOrdersResult =
  | { kind: 'ok'; orders: AdminOrder[]; nextCursor: string | null }
  | { kind: 'signed-out' | 'error' }
// The result of a step change.
export type ChangeStepResult =
  | { kind: 'changed'; order: AdminOrder; restocked: number }
  | { kind: 'conflict'; order: AdminOrder }
  | { kind: 'signed-out' | 'error' }
// The result of loading or saving the settings.
export type SettingsCallResult =
  | { kind: 'ok' | 'conflict'; orderEmailOn: boolean }
  | { kind: 'signed-out' | 'error' }

/**
 * Checks one value is an order of the Worker's list.
 * @param value anything
 * @return true for an object with every field in the right type
 */
function isAdminOrder(value: unknown): value is AdminOrder {
  if (typeof value !== 'object' || value === null) return false // not an object
  const row = value as Record<string, unknown> // read by field
  const buyer = row.buyer as Record<string, unknown> | null // the details or null
  return (
    typeof row.number === 'string' && // the order number
    typeof row.createdAt === 'string' && // an ISO time
    typeof row.step === 'string' &&
    STEPS.includes(row.step) && // a known step
    typeof row.currency === 'string' && // the currency code
    Number.isInteger(row.totalCents) && // whole cents
    Number.isInteger(row.itemCount) && // a whole count
    typeof row.club === 'string' && // the club
    (buyer === null ||
      (typeof buyer === 'object' &&
        typeof buyer.name === 'string' &&
        typeof buyer.email === 'string' &&
        typeof buyer.phone === 'string')) && // details or removed
    (row.personalDataRemovedAt === null || typeof row.personalDataRemovedAt === 'string') && // the removal time or none
    Array.isArray(row.lines) &&
    row.lines.every(
      (line: Record<string, unknown>) =>
        typeof line.itemId === 'string' &&
        typeof line.name === 'string' &&
        Number.isInteger(line.quantity) &&
        Number.isInteger(line.priceCents) &&
        typeof line.inShop === 'boolean',
    ) // every line
  )
}

/**
 * Loads one page of orders, or one order by number.
 * @param request the step or number, and the cursor
 * @return the page, signed-out, or error
 */
export async function loadOrderPage(request: OrderPageRequest): Promise<LoadOrdersResult> {
  const query = new URLSearchParams() // the Worker refuses a number together with a step or cursor
  if (request.number !== null) query.set('number', request.number) // a lookup stands alone
  else {
    if (request.step !== null) query.set('step', request.step) // all steps is left out
    if (request.cursor !== null) query.set('cursor', request.cursor) // the first page has none
  }
  const text = query.toString() // the query text
  const answer = await call(`/api/orders${text === '' ? '' : `?${text}`}`, { signal: request.signal }) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null || answer.status !== 200) return { kind: 'error' } // failed
  const list = field(answer.body, 'orders') // the orders
  const nextCursor = field(answer.body, 'nextCursor') // where the next page starts
  if (!Array.isArray(list) || !list.every(isAdminOrder) || (typeof nextCursor !== 'string' && nextCursor !== null))
    return { kind: 'error' } // a wrong shape is an error
  return { kind: 'ok', orders: list, nextCursor } // the page
}

/**
 * Changes an order's step; it is saved at once.
 * @param change the number, the step seen, the step wanted and whether a cancel restocks
 * @return the changed order, a conflict with the current order, signed-out, or error
 */
export async function changeOrderStep(change: StepChange): Promise<ChangeStepResult> {
  const answer = await post('/api/orders/step', change) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null) return { kind: 'error' } // the network failed
  const order = field(answer.body, 'order') // the order the Worker holds
  const restocked = field(answer.body, 'restocked') // the quantity put back
  if (answer.status === 200 && isAdminOrder(order) && Number.isInteger(restocked))
    return { kind: 'changed', order, restocked: restocked as number } // written
  if (answer.status === 409 && isAdminOrder(order)) return { kind: 'conflict', order } // nothing written
  return { kind: 'error' } // anything else
}

/**
 * Reads the order email switch out of an answer.
 * @param body the parsed answer
 * @return the switch, or undefined for a wrong shape
 */
const switchOf = (body: unknown): boolean | undefined => {
  const value = field(body, 'orderEmailOn') // the switch
  return typeof value === 'boolean' ? value : undefined // booleans only
}

/**
 * Loads the settings the admin can change.
 * @return the switch, signed-out, or error
 */
export async function loadSettings(): Promise<SettingsCallResult> {
  const answer = await call('/api/settings') // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  const value = answer === null ? undefined : switchOf(answer.body) // the switch
  if (answer === null || answer.status !== 200 || value === undefined) return { kind: 'error' } // failed or wrong shape
  return { kind: 'ok', orderEmailOn: value } // the switch
}

/**
 * Saves the order email switch; it is live at once.
 * @param from the value the admin saw
 * @param to the value the admin wants
 * @return the stored switch, a conflict with the stored switch, signed-out, or error
 */
export async function saveSettings(from: boolean, to: boolean): Promise<SettingsCallResult> {
  const answer = await post('/api/settings', { orderEmailOn: { from, to } }) // the request
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  const value = answer === null ? undefined : switchOf(answer.body) // the switch
  if (answer === null || value === undefined) return { kind: 'error' } // failed or wrong shape
  if (answer.status === 200) return { kind: 'ok', orderEmailOn: value } // written
  if (answer.status === 409) return { kind: 'conflict', orderEmailOn: value } // nothing written
  return { kind: 'error' } // anything else
}

// The result of loading the clubs or writing one: the whole list after a write.
export type ClubCallResult =
  | { kind: 'ok' | 'conflict'; clubs: AdminClub[] }
  | { kind: 'name-taken' | 'signed-out' | 'error' }

/**
 * Checks one value is a club of the Worker's list.
 * @param value anything
 * @return true for an object with every field in the right type
 */
function isAdminClub(value: unknown): value is AdminClub {
  if (typeof value !== 'object' || value === null) return false // not an object
  const row = value as Record<string, unknown> // read by field
  const text = (entry: unknown) => entry === null || typeof entry === 'string' // an optional text
  return (
    Number.isInteger(row.id) && // the club's id
    typeof row.name === 'string' && // the name
    text(row.area) && // optional
    text(row.language) && // optional
    text(row.location) && // optional
    text(row.churchName) // optional
  )
}

/**
 * Reads a club write's answer.
 * @param answer what `call` or `post` gave back
 * @param okStatus the status a write answers with (200, or 201 for Add)
 * @return the list after the write, a conflict with the latest list, a taken name, signed-out, or error
 */
function readClubAnswer(answer: Awaited<ReturnType<typeof call>>, okStatus: number): ClubCallResult {
  if (answer === 'signed-out') return { kind: 'signed-out' } // the session ended
  if (answer === null) return { kind: 'error' } // the network failed
  const list = field(answer.body, 'clubs') // the whole list, when there is one
  const valid = Array.isArray(list) && list.every(isAdminClub) // a right-shaped list
  if (answer.status === okStatus && valid) return { kind: 'ok', clubs: list } // written
  if (answer.status === 409 && field(answer.body, 'error') === 'name-taken') return { kind: 'name-taken' } // another club has the name
  if (answer.status === 409 && valid) return { kind: 'conflict', clubs: list } // nothing written
  return { kind: 'error' } // anything else
}

/**
 * Loads the clubs in the order buyers see them.
 * @return the list, signed-out, or error
 */
export async function loadClubs(): Promise<ClubCallResult> {
  return readClubAnswer(await call('/api/clubs'), 200) // the request
}

/**
 * Adds a club at the end of the list; it is saved at once.
 * @param fields the club's name and details
 * @return the list, a taken name, signed-out, or error
 */
export async function addClub(fields: ClubFields): Promise<ClubCallResult> {
  return readClubAnswer(await postClub('/api/clubs', fields), 201) // the request
}

/**
 * Renames a club or changes its details; it is saved at once.
 * @param edit the id, the values seen and the values wanted
 * @return the list, a conflict with the latest list, a taken name, signed-out, or error
 */
export async function editClub(edit: ClubEdit): Promise<ClubCallResult> {
  return readClubAnswer(await postClub('/api/clubs/edit', edit), 200) // the request
}

/**
 * Removes a club; it is saved at once.
 * @param remove the id and the values seen
 * @return the list, a conflict with the latest list, signed-out, or error
 */
export async function removeClub(remove: ClubRemove): Promise<ClubCallResult> {
  return readClubAnswer(await postClub('/api/clubs/remove', remove), 200) // the request
}

/**
 * Saves a new club order; it is saved at once.
 * @param order the ids in the order seen and in the order wanted
 * @return the list, a conflict with the latest list, signed-out, or error
 */
export async function moveClubs(order: ClubOrder): Promise<ClubCallResult> {
  return readClubAnswer(await postClub('/api/clubs/order', order), 200) // the request
}
