// Order email tests: the words, the sender and recipient, and the rule that a failed or skipped email never touches the saved order.

import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { orderEmail } from '../src/order-email'
import { CLUB_INBOX, count, fakeEmail, mockSiteverify, postOrder, seedShop, validOrder } from './helpers'

const saved = {
  number: 'PF-20261102-ABCD',
  createdAt: '2026-11-01T17:00:00.000Z',
  currency: 'MYR',
  totalCents: 1050,
  lines: [
    { itemId: 'knots', name: 'Knot Tying', quantity: 2, priceCents: 300 },
    { itemId: 'rope', name: 'Rope Work', quantity: 1, priceCents: 450 },
  ],
} // An order as saved.

describe('orderEmail', () => {
  it('writes the subject and text word for word with the admin line last', async () => {
    // Catches a changed line format, a missing total or a missing admin link.
    const email = orderEmail(saved, { name: 'Ana Tester', email: 'ana@example.com', phone: '+60 12-345 6789', club: { name: 'Gilead', typed: false } }, 'https://admin.example.test') // Listed club.
    expect(email.subject).toBe('PEM Pathfinder Store order PF-20261102-ABCD — Gilead — Ana Tester') // Subject.
    expect(email.text).toBe(
      [
        'Order: PF-20261102-ABCD',
        'Name:  Ana Tester',
        'Email: ana@example.com',
        'Phone: +60 12-345 6789',
        'Club:  Gilead',
        '',
        '2 × Knot Tying @ RM 3.00 = RM 6.00',
        '1 × Rope Work @ RM 4.50 = RM 4.50',
        '',
        'Estimated total: RM 10.50',
        '',
        'Open this order: https://admin.example.test/#/orders/PF-20261102-ABCD',
      ].join('\n'),
    ) // Exact text.
  })

  it('writes a typed club as "Other: Riverside" in the body and the plain name in the subject', async () => {
    // Catches the flag being lost in the email.
    const email = orderEmail(saved, { name: 'Ana', email: 'a@b.co', phone: '1234567', club: { name: 'Riverside', typed: true } }, 'https://admin.example.test') // Typed.
    expect(email.text).toContain('Club:  Other: Riverside') // Body.
    expect(email.subject).toBe('PEM Pathfinder Store order PF-20261102-ABCD — Riverside — Ana') // Subject.
  })

  it('never says "honor" and uses a plain space in money', async () => {
    // Catches banned copy and a no-break space that renders badly in mail clients.
    const email = orderEmail(saved, { name: 'Ana', email: 'a@b.co', phone: '1234567', club: { name: 'Gilead', typed: false } }, 'https://admin.example.test') // Any.
    expect(`${email.subject}\n${email.text}`).not.toMatch(/honor/i) // Copy rule.
    expect(email.text).not.toContain(' ') // Plain spaces.
  })
})

describe('orderEmail money symbols', () => {
  it('writes SGD with $ and CNY with the yen sign, MYR with RM and a plain space', async () => {
    // Catches an email that keeps the Intl symbols or a code outside the site's table.
    const buyer = { name: 'Ana', email: 'a@b.co', phone: '1234567', club: { name: 'Gilead', typed: false } } // Any buyer.
    const textFor = (currency: string) => orderEmail({ ...saved, currency }, buyer, 'https://admin.example.test').text // The text in one currency.
    expect(textFor('SGD')).toContain('2 × Knot Tying @ $3.00 = $6.00') // Dollar.
    expect(textFor('SGD')).toContain('Estimated total: $10.50') // Total.
    expect(textFor('CNY')).toContain('2 × Knot Tying @ \u00a53.00 = \u00a56.00') // Yen sign.
    expect(textFor('MYR')).toContain('2 × Knot Tying @ RM 3.00 = RM 6.00') // Ringgit, plain space.
  })
})

describe('orderEmail money formatting', () => {
  const buyer = { name: 'Ana', email: 'a@b.co', phone: '1234567', club: { name: 'Gilead', typed: false } } // Any buyer.

  it('groups thousands in a line and in the total', async () => {
    // Catches an email that prints "RM 1200.00" after the shop prints "RM 1,200.00".
    const big = { ...saved, totalCents: 120000, lines: [{ itemId: 'knots', name: 'Knot Tying', quantity: 30, priceCents: 4000 }] } // 30 x 40.00.
    const text = orderEmail(big, buyer, 'https://admin.example.test').text // The email text.
    expect(text).toContain('30 × Knot Tying @ RM 40.00 = RM 1,200.00') // Line total grouped.
    expect(text).toContain('Estimated total: RM 1,200.00') // Total grouped.
  })

  it('prints a currency outside the list as its code', async () => {
    // Catches Intl's "$" for BND coming back.
    const bnd = { ...saved, currency: 'BND', totalCents: 300, lines: [{ itemId: 'knots', name: 'Knot Tying', quantity: 1, priceCents: 300 }] } // One line in BND.
    expect(orderEmail(bnd, buyer, 'https://admin.example.test').text).toContain('Estimated total: BND 3.00') // Code, not a sign.
  })
})

describe('order email on POST /orders', () => {
  beforeEach(async () => {
    await seedShop() // Honors and settings.
    mockSiteverify() // Captcha passes.
  })
  afterEach(() => vi.restoreAllMocks()) // Spies off.

  it('sends from orders@stardew.win to the club inbox with the buyer as reply-to, after the order is in D1', async () => {
    // Catches a wrong sender, a missing reply-to, or an email sent before the save.
    let ordersWhenSent = -1 // Count at send time.
    const email = fakeEmail(async () => { ordersWhenSent = await count('orders'); return {} }) // Records the database state.
    const { res, ctx } = await postOrder(validOrder({ club: { name: 'Riverside', typed: true } }), { overrides: { ORDER_EMAIL: email } }) // Send.
    const { waitOnExecutionContext } = await import('cloudflare:test') // Finish background work.
    await waitOnExecutionContext(ctx) // Email sent.
    expect(res.status).toBe(201) // Saved.
    expect(email.send).toHaveBeenCalledTimes(1) // Once.
    const message = email.send.mock.calls[0][0] as { from: { email: string; name: string }; to: string; replyTo: string; subject: string; text: string } // What was sent.
    expect(message.from).toEqual({ email: 'orders@stardew.win', name: 'PEM Pathfinder Store' }) // Sender.
    expect(message.to).toBe(CLUB_INBOX) // Secret recipient.
    expect(message.replyTo).toBe('ana@example.com') // The buyer.
    expect(message.subject).toMatch(/^PEM Pathfinder Store order PF-\d{8}-[A-Z0-9]{4} — Riverside — Ana Tester$/) // Subject.
    expect(message.text).toContain('Club:  Other: Riverside') // Body.
    expect(message.text).toContain('2 × Knot Tying @ RM 3.00 = RM 6.00') // Line.
    expect(message.text.split('\n').at(-1)).toBe(`Open this order: ${env.ADMIN_URL}/#/orders/${message.subject.match(/PF-\d{8}-[A-Z0-9]{4}/)![0]}`) // Last line.
    expect(ordersWhenSent).toBe(1) // Already saved.
  })

  it('words the sent email in the currency set in settings', async () => {
    // Catches an email that keeps RM after the shop's currency changed.
    await env.DB.exec("UPDATE settings SET currency = 'CNY'") // The admin's change.
    const email = fakeEmail() // Fake.
    const { res, ctx } = await postOrder(validOrder(), { overrides: { ORDER_EMAIL: email } }) // Send.
    const { waitOnExecutionContext } = await import('cloudflare:test') // Finish.
    await waitOnExecutionContext(ctx) // Done.
    expect(res.status).toBe(201) // Saved.
    const message = email.send.mock.calls[0][0] as { text: string } // What was sent.
    expect(message.text).toContain('2 × Knot Tying @ \u00a53.00 = \u00a56.00') // Yen sign.
    expect(message.text).not.toContain('RM') // No old symbol.
  })

  it('sends nothing when the switch is off, still answering 201', async () => {
    // Catches ignoring the admin's email switch.
    await env.DB.exec('UPDATE settings SET order_email_on = 0') // Off.
    const email = fakeEmail() // Fake.
    const { res, ctx } = await postOrder(validOrder(), { overrides: { ORDER_EMAIL: email } }) // Send.
    const { waitOnExecutionContext } = await import('cloudflare:test') // Finish.
    await waitOnExecutionContext(ctx) // Done.
    expect(res.status).toBe(201) // Saved.
    expect(email.send).not.toHaveBeenCalled() // No email.
  })

  it('sends nothing for a repeat, a refusal or invalid input', async () => {
    // Catches a second email for one order, or an email for an order that was never saved.
    const email = fakeEmail() // Fake.
    const body = validOrder() // One id.
    const first = await postOrder(body, { overrides: { ORDER_EMAIL: email } }) // Saved: one email.
    const repeat = await postOrder(body, { overrides: { ORDER_EMAIL: email } }) // Repeat.
    const refused = await postOrder(validOrder({ lines: [{ itemId: 'secret', quantity: 1 }] }), { overrides: { ORDER_EMAIL: email } }) // Hidden item.
    const invalid = await postOrder(validOrder({ phone: '1' }), { overrides: { ORDER_EMAIL: email } }) // Bad phone.
    const { waitOnExecutionContext } = await import('cloudflare:test') // Finish.
    for (const sent of [first, repeat, refused, invalid]) await waitOnExecutionContext(sent.ctx) // All done.
    expect([first.res.status, repeat.res.status, refused.res.status, invalid.res.status]).toEqual([201, 200, 409, 400]) // As expected.
    expect(email.send).toHaveBeenCalledTimes(1) // Only the first.
  })

  it('still answers 201 when send throws, logging only the number and the error name', async () => {
    // Catches a failed email failing the order, or buyer data in the log.
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {}) // Capture.
    const email = fakeEmail(async () => { throw new TypeError('rejected ana@example.com Ana Tester') }) // Throws with private text.
    const { res, ctx } = await postOrder(validOrder(), { overrides: { ORDER_EMAIL: email } }) // Send.
    const { waitOnExecutionContext } = await import('cloudflare:test') // Finish.
    await waitOnExecutionContext(ctx) // Done.
    expect(res.status).toBe(201) // Saved.
    expect(await count('orders')).toBe(1) // In D1.
    expect(logs).toHaveBeenCalledTimes(1) // One line.
    const [message, number, name] = logs.mock.calls[0] // Its parts.
    expect(message).toBe('order email failed') // Fixed text.
    expect(number).toMatch(/^PF-\d{8}-[A-Z0-9]{4}$/) // The number.
    expect(name).toBe('TypeError') // The error class only.
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/Ana|ana@/) // No private content.
  })

  it('answers before send finishes', async () => {
    // Catches awaiting the email inside the request, which would make Send order wait on mail.
    const email = fakeEmail(() => new Promise(() => {})) // Never finishes.
    const { res } = await postOrder(validOrder(), { overrides: { ORDER_EMAIL: email } }) // Resolves anyway.
    expect(res.status).toBe(201) // Answered.
  })
})
