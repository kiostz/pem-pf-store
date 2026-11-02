// The words shown when the shop fails to load, by reason, in one place so the four screens that read the shop never drift apart.

import type { ShopLoadFailure } from '@/shared/data/load.ts' // busy (429) or failed

/**
 * Gives the message for a failed or refused load.
 * @param reason 'busy' when the Worker refused with 429, 'failed' for anything else
 * @return the sentence to show above Try again
 */
export function loadErrorText(reason: ShopLoadFailure): string {
  return reason === 'busy'
    ? 'The shop is busy right now. Try again in a minute.' // waiting helps
    : "We couldn't load the shop. Check your connection and try again." // check the connection
}
