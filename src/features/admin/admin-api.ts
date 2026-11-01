// The admin page's two calls to the Admin Worker: load the rows and send the changes, each answer reduced to a kind the screen can act on.

import type {
  AdminHonor,
  HonorChange,
} from '../../../workers/admin/src/admin-types.ts' // the shared shapes

// The result of loading the rows.
export type LoadResult =
  | { kind: 'ok'; honors: AdminHonor[] }
  | { kind: 'signed-out' }
  | { kind: 'error' }
// The result of sending changes.
export type SendResult =
  | { kind: 'saved' | 'conflict'; honors: AdminHonor[] }
  | { kind: 'signed-out' }
  | { kind: 'error' }

/**
 * Checks one value is a row of the Worker's list.
 * @param value anything
 * @return true for an object with the five fields in the right types
 */
function isAdminHonor(value: unknown): value is AdminHonor {
  if (typeof value !== 'object' || value === null) return false // not an object
  const row = value as Record<string, unknown> // read by field
  return (
    typeof row.id === 'string' && // the id
    typeof row.name === 'string' && // the name
    typeof row.category === 'string' && // the category
    (row.status === 'active' || row.status === 'hidden') && // the status
    typeof row.stock === 'number' && // the stock is a number
    Number.isInteger(row.stock) // a whole number, never text
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
 * Tells whether an answer means the Access session has gone.
 * @param response the answer
 * @return true for a blocked redirect (an Access login) or a 403
 */
const isSignedOut = (response: Response): boolean =>
  response.type === 'opaqueredirect' || response.status === 403 // both mean "sign in again"

/**
 * Loads every row.
 * @return the rows, signed-out, or error
 */
export async function loadAdminHonors(): Promise<LoadResult> {
  try {
    const response = await fetch('/api/items', {
      redirect: 'manual',
      credentials: 'same-origin',
    }) // never follow an Access redirect
    if (isSignedOut(response)) return { kind: 'signed-out' } // the session ended
    if (!response.ok) return { kind: 'error' } // the Worker failed
    const body: unknown = await response.json() // the rows
    return isHonorList(body) ? { kind: 'ok', honors: body } : { kind: 'error' } // a wrong shape is an error
  } catch {
    return { kind: 'error' } // a network failure or unreadable body
  }
}

/**
 * Sends the changes in one save.
 * @param changes the changes, each with its `from` and `to`
 * @return saved rows, the current rows of a conflict, signed-out, or error
 */
export async function sendHonorChanges(
  changes: HonorChange[],
): Promise<SendResult> {
  try {
    const response = await fetch('/api/items/changes', {
      method: 'POST', // a write
      redirect: 'manual', // never follow an Access redirect
      credentials: 'same-origin', // the Access cookie
      headers: { 'Content-Type': 'application/json' }, // the Worker refuses anything else
      body: JSON.stringify({ changes }), // the changes
    })
    if (isSignedOut(response)) return { kind: 'signed-out' } // the session ended
    const body: unknown = await response.json().catch(() => null) // the answer, if it is JSON
    const honors =
      typeof body === 'object' && body !== null
        ? (body as { honors?: unknown }).honors
        : undefined // the rows it carries
    if (response.status === 200 && isHonorList(honors))
      return { kind: 'saved', honors } // written
    if (response.status === 409 && isHonorList(honors))
      return { kind: 'conflict', honors } // nothing written
    return { kind: 'error' } // anything else
  } catch {
    return { kind: 'error' } // a network failure
  }
}
