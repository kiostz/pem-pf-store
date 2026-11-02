// Keeps the send in flight (request id, cart lines sent, form fields) in sessionStorage, so a reload before the Worker's answer reuses the request id and never makes a second order.

import type { OrderFormValues } from './order-form.ts' // the form fields kept

export type PendingSend = {
  requestId: string // the id the Worker keys the order on
  lines: Array<[string, number]> // the cart lines sent: honor id and quantity
  values: OrderFormValues // the form as sent
} // one send in flight

export const PENDING_SEND_STORAGE_KEY = 'pem-pf-store:pending-send' // repo name in the key: the site origin is shared by the account's other sites
const PENDING_SEND_VERSION = 1 // the stored format
const FORM_FIELDS = ['name', 'email', 'phone', 'club', 'otherClub'] as const // every field of the form

/**
 * Tells whether a stored value is a whole pending send.
 * @param value whatever the storage held, parsed
 * @return true when every part is there with the right kind of value
 */
function isPendingSend(value: unknown): value is PendingSend {
  if (typeof value !== 'object' || value === null) return false // not a pending send
  const pending = value as Record<string, unknown> // for reading parts
  const values = pending.values as Record<string, unknown> | null | undefined // the form part
  return (
    typeof pending.requestId === 'string' && // the id
    pending.requestId.length > 0 && // not empty
    Array.isArray(pending.lines) && // the lines
    pending.lines.length > 0 && // at least one line
    pending.lines.every(
      (line: unknown) =>
        Array.isArray(line) &&
        line.length === 2 &&
        typeof line[0] === 'string' &&
        Number.isInteger(line[1]),
    ) && // each one an id and a whole quantity
    typeof values === 'object' && // the form part exists
    values !== null && // and is not null
    FORM_FIELDS.every((field) => typeof values[field] === 'string') // every field is text
  )
}

/**
 * Reads the pending send; a malformed or foreign value is removed.
 * @param storage where to read; the browser's sessionStorage by default
 * @return the pending send, or null when there is none, the storage is blocked, or the value is unusable
 */
export function readPendingSend(storage?: Storage): PendingSend | null {
  try {
    const target = storage ?? window.sessionStorage // where it lives; blocked site data throws on this read
    const text = target.getItem(PENDING_SEND_STORAGE_KEY) // the stored text
    if (text === null) return null // nothing pending
    let parsed: unknown = null // whatever the text holds
    try {
      parsed = JSON.parse(text) // bad JSON throws
    } catch {
      // falls through to the removal below
    }
    const stored = parsed as { version?: unknown; pending?: unknown } | null // the wrapper, its parts checked below
    if (
      typeof parsed === 'object' &&
      stored !== null &&
      stored.version === PENDING_SEND_VERSION &&
      isPendingSend(stored.pending)
    )
      return stored.pending // whole and of this format
    target.removeItem(PENDING_SEND_STORAGE_KEY) // never read again
    console.warn('Stored pending send is unusable and was removed.') // no content in the warning
    return null // unusable: the form starts empty
  } catch {
    console.warn('Pending send storage cannot be read.') // never the error text: it may hold stored content
    return null // blocked storage: the send goes on without it
  }
}

/**
 * Stores the pending send.
 * @param pending the send about to leave
 * @param storage where to write; the browser's sessionStorage by default
 * @return nothing; blocked or full storage gives a warning and the send goes on
 */
export function writePendingSend(
  pending: PendingSend,
  storage?: Storage,
): void {
  try {
    ;(storage ?? window.sessionStorage).setItem(
      PENDING_SEND_STORAGE_KEY,
      JSON.stringify({ version: PENDING_SEND_VERSION, pending }),
    ) // blocked or full storage throws
  } catch {
    console.warn('Pending send cannot be kept for a reload.') // no content in the warning
  }
}

/**
 * Removes the pending send.
 * @param storage where to remove; the browser's sessionStorage by default
 * @return nothing; blocked storage gives a warning
 */
export function clearPendingSend(storage?: Storage): void {
  try {
    ;(storage ?? window.sessionStorage).removeItem(PENDING_SEND_STORAGE_KEY) // gone
  } catch {
    console.warn('Pending send cannot be removed.') // no content in the warning
  }
}
