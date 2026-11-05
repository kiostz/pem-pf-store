// Words and sends the order email, so the order handler reads one plain message per order; a failed send never touches the saved order.

import type { OrderRequest, SavedOrder } from './api-types'
import { clubBodyText } from './save-order'

const STORE_NAME = 'PEM Pathfinder Store' // The sender name and subject prefix.

/**
 * Writes an amount for the email with a plain space.
 * @param cents The amount in cents.
 * @param currency The ISO code.
 * @return For example "RM 9.00".
 */
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(cents / 100).replace(/\u00a0/g, ' ') // Plain space reads the same in every mail client.
}

/**
 * Builds the email for one saved order.
 * @param order The saved order.
 * @param buyer The buyer's name, email, phone and club from the request.
 * @param adminUrl The address of the admin page, for the order link on the last line.
 * @return The subject and the text.
 */
export function orderEmail(
  order: SavedOrder,
  buyer: Pick<OrderRequest, 'name' | 'email' | 'phone' | 'club'>,
  adminUrl: string,
): { subject: string; text: string } {
  const lineTexts = order.lines.map(
    (line) => `${line.quantity} × ${line.name} @ ${money(line.priceCents, order.currency)} = ${money(line.priceCents * line.quantity, order.currency)}`,
  ) // "3 × Knot Tying @ RM 3.00 = RM 9.00".
  return {
    subject: `${STORE_NAME} order ${order.number} — ${buyer.club.name} — ${buyer.name}`, // Number, club, buyer.
    text: [
      `Order: ${order.number}`, // The number the handler pairs by.
      `Name:  ${buyer.name}`, // The buyer.
      `Email: ${buyer.email}`, // Where the invoice goes.
      `Phone: ${buyer.phone}`, // The buyer's number.
      `Club:  ${clubBodyText(buyer.club)}`, // The club, flagged when typed.
      '', // Blank line before the lines.
      ...lineTexts, // One per order line.
      '', // Blank line before the total.
      `Estimated total: ${money(order.totalCents, order.currency)}`, // From the saved prices.
      '', // Blank line before the link.
      `Open this order: ${adminUrl}/#/orders/${order.number}`, // Straight to the order; the number is not personal data.
    ].join('\n'), // One block.
  }
}

/**
 * Sends the order email; never throws, so the order stays saved whatever happens.
 * @param env The Worker bindings (email binding, sender, recipient, admin address).
 * @param order The saved order.
 * @param buyer The buyer's details from the request.
 * @return Resolves when the send finished or failed.
 */
export async function sendOrderEmail(
  env: Pick<Env, 'ORDER_EMAIL' | 'ORDER_EMAIL_FROM' | 'ORDER_EMAIL_TO' | 'ADMIN_URL'>,
  order: SavedOrder,
  buyer: Pick<OrderRequest, 'name' | 'email' | 'phone' | 'club'>,
): Promise<void> {
  try {
    const { subject, text } = orderEmail(order, buyer, env.ADMIN_URL) // The message.
    await env.ORDER_EMAIL.send({ from: { email: env.ORDER_EMAIL_FROM, name: STORE_NAME }, to: env.ORDER_EMAIL_TO, replyTo: buyer.email, subject, text }) // To the club inbox.
  } catch (error) {
    console.error('order email failed', order.number, error instanceof Error ? error.name : 'unknown') // Number and error class only.
  }
}
