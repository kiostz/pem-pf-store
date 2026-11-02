// Order request validation tests: every limit on both sides, so a bad body is refused where it enters and a good one is cleaned before it is stored.

import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseOrderRequest } from '../src/order-request'
import { count, mockSiteverify, postOrder, seedShop, validOrder } from './helpers'

/**
 * Builds a valid body with one top-level field changed.
 * @param overrides The change.
 * @return The body.
 */
const body = (overrides: Record<string, unknown>) => validOrder(overrides) // Shorter name.

describe('parseOrderRequest', () => {
  it('accepts a valid body and ignores extra keys', async () => {
    // Catches a base body that is itself refused, and a strict-keys check that breaks a newer shop.
    const parsed = parseOrderRequest({ ...validOrder(), extra: 'x' }) // Extra key.
    expect(parsed?.name).toBe('Ana Tester') // Parsed.
    expect(parsed).not.toHaveProperty('extra') // Dropped.
  })

  it.each([
    ['name 0', { name: '' }, false],
    ['name only spaces', { name: '   ' }, false],
    ['name 1', { name: 'A' }, true],
    ['name 100', { name: 'a'.repeat(100) }, true],
    ['name 101', { name: 'a'.repeat(101) }, false],
    ['name 100 plus spaces', { name: ` ${'a'.repeat(100)} ` }, true],
    ['club name 0', { club: { name: '', typed: false } }, false],
    ['club name 100', { club: { name: 'c'.repeat(100), typed: true } }, true],
    ['club name 101', { club: { name: 'c'.repeat(101), typed: true } }, false],
    ['club typed not boolean', { club: { name: 'Gilead', typed: 'no' } }, false],
    ['club a string', { club: 'Gilead' }, false],
    ['email without at', { email: 'ana.example.com' }, false],
    ['email without dot', { email: 'ana@example' }, false],
    ['email with space', { email: 'a na@example.com' }, false],
    ['email 254', { email: `${'a'.repeat(242)}@example.com` }, true],
    ['email 255', { email: `${'a'.repeat(243)}@example.com` }, false],
    ['phone 6 digits', { phone: '123456' }, false],
    ['phone 7 digits', { phone: '1234567' }, true],
    ['phone 15 digits', { phone: '+(60) 123-456 78901' }, true],
    ['phone 16 digits', { phone: '1234567890123456' }, false],
    ['phone letters', { phone: '12345abc789' }, false],
    ['quantity 0', { lines: [{ honorId: 'knots', quantity: 0 }] }, false],
    ['quantity 1', { lines: [{ honorId: 'knots', quantity: 1 }] }, true],
    ['quantity 99', { lines: [{ honorId: 'knots', quantity: 99 }] }, true],
    ['quantity 100', { lines: [{ honorId: 'knots', quantity: 100 }] }, false],
    ['quantity 1.5', { lines: [{ honorId: 'knots', quantity: 1.5 }] }, false],
    ['quantity "2"', { lines: [{ honorId: 'knots', quantity: '2' }] }, false],
    ['duplicate honor id', { lines: [{ honorId: 'knots', quantity: 1 }, { honorId: 'knots', quantity: 2 }] }, false],
    ['empty honor id', { lines: [{ honorId: '', quantity: 1 }] }, false],
    ['0 lines', { lines: [] }, false],
    ['lines not an array', { lines: 'knots' }, false],
    ['500 lines', { lines: Array.from({ length: 500 }, (_, i) => ({ honorId: `h${i}`, quantity: 1 })) }, true],
    ['501 lines', { lines: Array.from({ length: 501 }, (_, i) => ({ honorId: `h${i}`, quantity: 1 })) }, false],
    ['request id not a UUID', { requestId: 'not-a-uuid' }, false],
    ['request id missing', { requestId: undefined }, false],
    ['token empty', { turnstileToken: '' }, false],
    ['token 2048', { turnstileToken: 't'.repeat(2048) }, true],
    ['token 2049', { turnstileToken: 't'.repeat(2049) }, false],
  ])('%s', async (_name, change, valid) => {
    // Catches an off-by-one on each limit of the order form's rules, mirrored on the Worker.
    expect(parseOrderRequest(body(change)) !== null).toBe(valid) // Refused or accepted.
  })

  it.each([null, 'text', 7, [], undefined])('refuses %s as a body', async (value) => {
    // Catches a crash on a body that is not an object.
    expect(parseOrderRequest(value)).toBeNull() // Refused.
  })

  it('folds control characters in the name and club to one space', async () => {
    // Catches a newline in a stored name, which would add a line to the order email.
    const parsed = parseOrderRequest(body({ name: 'Ana\r\n Tester', club: { name: 'River\nside', typed: true } })) // Dirty text.
    expect(parsed?.name).toBe('Ana Tester') // One space.
    expect(parsed?.club.name).toBe('River side') // One space.
  })
})

describe('POST /orders input limits', () => {
  beforeEach(async () => {
    await seedShop() // Honors and settings.
  })

  it('answers 400 invalid for non-JSON without calling Turnstile or writing', async () => {
    // Catches a JSON.parse exception becoming a 500, or a captcha token spent on garbage.
    const spy = mockSiteverify() // Must stay unused.
    const { res } = await postOrder('{nope') // Not JSON.
    expect(res.status).toBe(400) // Refused.
    expect(await res.json()).toEqual({ error: 'invalid' }) // Short code, no field named.
    expect(spy).not.toHaveBeenCalled() // No captcha call.
    expect(await count('orders')).toBe(0) // Nothing written.
    spy.mockRestore() // Undo.
  })

  it('refuses a body over 64 KB and accepts one just under it', async () => {
    // Catches an unbounded body read.
    const spy = mockSiteverify() // Captcha passes.
    const big = JSON.stringify({ ...validOrder(), pad: 'x'.repeat(65 * 1024) }) // Over the cap.
    expect((await postOrder(big)).res.status).toBe(400) // Refused.
    const justUnder = JSON.stringify({ ...validOrder(), pad: 'x'.repeat(60 * 1024) }) // Under the cap.
    expect((await postOrder(justUnder)).res.status).toBe(201) // Accepted.
    spy.mockRestore() // Undo.
  })

  it('stores a newline in the name as a space', async () => {
    // Catches stored control characters reaching the email and the admin.
    const spy = mockSiteverify() // Captcha passes.
    expect((await postOrder(validOrder({ name: 'Ana\nTester' }))).res.status).toBe(201) // Saved.
    const row = await env.DB.prepare('SELECT buyer_name FROM orders').first<{ buyer_name: string }>() // The row.
    expect(row?.buyer_name).toBe('Ana Tester') // Folded.
    spy.mockRestore() // Undo.
  })
})
