// Tests for the confirmation page: the whole order read back from storage, the Print action, the empty state, and what stays off the printed page.

import { fireEvent, render, screen, within } from '@testing-library/react' // render and query
import { afterEach, describe, expect, it, vi } from 'vitest' // test API and mocks
import { ConfirmationScreen } from './ConfirmationScreen.tsx' // code under test
import type { SentOrder } from './order-email.ts' // the stored shape
import { SENT_ORDER_STORAGE_KEY, writeSentOrder } from './sent-order-storage.ts' // fills the stored order

const order: SentOrder = {
  number: 'PF-20261028-4K7Q',
  sentAt: '2026-10-28T10:00:00.000Z',
  currency: 'MYR',
  lines: [
    { itemId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 },
    { itemId: 'first-aid', name: 'First Aid', quantity: 1, priceCents: 350 },
  ],
  totalCents: 1250,
  contact: { name: 'J. Cruz', email: 'jc@mail.com', phone: '+60 12-345 6789' },
  club: { subject: 'Eagles', email: 'Eagles' },
  changesNotSent: false,
} // an order as sent

afterEach(() => {
  writeSentOrder(order) // a good write forgets any order held in memory
  window.sessionStorage.clear() // nothing left for the next test
  vi.restoreAllMocks() // spies removed
})

describe('ConfirmationScreen', () => {
  it('shows the focused Order sent heading and the order number', () => {
    // catches: a confirmation with no number, or focus left behind on arrival
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Order sent' })).toHaveFocus()
    expect(screen.getByText('PF-20261028-4K7Q')).toBeInTheDocument()
  })

  it('shows each order line with quantity, price and line total, then the estimated total', () => {
    // catches: lines missing or a total that does not match the lines
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    const lines = screen.getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(within(lines[0]).getByText('Knot Tying')).toBeInTheDocument()
    expect(within(lines[0]).getByText(/3 × RM\s3\.00/)).toBeInTheDocument()
    expect(within(lines[0]).getByText(/RM\s9\.00/)).toBeInTheDocument()
    expect(within(lines[1]).getByText('First Aid')).toBeInTheDocument()
    expect(within(lines[1]).getByText(/1 × RM\s3\.50/)).toBeInTheDocument()
    expect(screen.getByText('Estimated total')).toBeInTheDocument()
    expect(screen.getByText(/RM\s12\.50/)).toBeInTheDocument()
  })

  it('shows a version 2 order stored with honorId lines', () => {
    // catches: an order sent before the rename showing "no order" on the confirmation after an update
    window.sessionStorage.setItem(
      SENT_ORDER_STORAGE_KEY,
      JSON.stringify({ version: 2, order: { ...order, lines: [{ honorId: 'knot-tying', name: 'Knot Tying', quantity: 3, priceCents: 300 }] } }),
    )
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('PF-20261028-4K7Q')).toBeInTheDocument()
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Knot Tying')).toBeInTheDocument()
  })

  it('shows the buyer, phone, club and the send date', () => {
    // catches: a confirmation that hides who the order was for
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('J. Cruz')).toBeInTheDocument()
    expect(screen.getByText('+60 12-345 6789', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Eagles')).toBeInTheDocument()
    expect(screen.getByText('28 Oct 2026')).toBeInTheDocument()
  })

  it('says the order will be reviewed and where the buyer will be contacted', () => {
    // catches: no word on what happens next, or contact details the buyer cannot check for a typo
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText(/Keep this number/)).toHaveTextContent(
      "Keep this number. We'll review your order and contact you at jc@mail.com or +60 12-345 6789 to confirm it. Thank you!",
    )
  })

  it('keeps the phone number on one line inside the next-step sentence', () => {
    // catches: the number split across two lines at 375 px, where a typo is hardest to spot
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('+60 12-345 6789', { selector: 'p span' })).toHaveClass('whitespace-nowrap')
  })

  it('warns once about a bad stored order even when the page draws again', () => {
    // catches: the stored value read and warned about on every render
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.sessionStorage.setItem(
      'pem-pf-store:sent-order',
      JSON.stringify({ version: 1, order: { number: 'x' } }),
    )
    const { rerender } = render(<ConfirmationScreen onBack={() => {}} />)
    rerender(<ConfirmationScreen onBack={() => {}} />)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('shows the order from memory when sessionStorage could not be written', () => {
    // catches: a sent order shown as "no order" because storage is blocked
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage // storage that refuses every call
    writeSentOrder(order, blocked)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('PF-20261028-4K7Q')).toBeInTheDocument()
  })

  it('opens the print dialog from the Save as PDF or print button, once', () => {
    // catches: a print button wired to nothing, or one that opens the dialog twice
    writeSentOrder(order)
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ConfirmationScreen onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF or print' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('leaves the Confirmation page by the header only: no Browse more, no link, one button', () => {
    // catches: a second way back under the print button, against the one-way-back rule
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.queryByText(/Browse more|Back to honors|Browse honors/)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('keeps every button and link off the printed page', () => {
    // catches: a Save as PDF or print button printed onto the paper copy
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    for (const control of [...screen.getAllByRole('button'), ...screen.queryAllByRole('link')])
      expect(control).toHaveClass('print:hidden')
  })

  it('labels the order number and keeps each order line whole across a printed page break', () => {
    // catches: an unlabelled number, or a line cut in half between two sheets
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('Order number')).toBeInTheDocument()
    for (const line of screen.getAllByRole('listitem')) expect(line).toHaveClass('print:break-inside-avoid')
  })

  it('says there is no order when nothing is stored, and leads back with Browse more', () => {
    // catches: a blank page for a buyer who opens the address by hand
    const onBack = vi.fn()
    render(<ConfirmationScreen onBack={onBack} />)
    expect(screen.getByText('There is no order to show here.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Order sent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save as PDF or print' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Browse more' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
  it('shows the empty state, not a crash, for a stored value of the right version but the wrong shape', () => {
    // catches: a foreign stored order throwing in the confirmation render
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.sessionStorage.setItem(
      'pem-pf-store:sent-order',
      JSON.stringify({ version: 1, order: { number: 'PF-20261028-4K7Q' } }),
    )
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('There is no order to show here.')).toBeInTheDocument()
  })

  it('shows the empty state for bad JSON in the stored order', () => {
    // catches: a parse error reaching the page
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.sessionStorage.setItem('pem-pf-store:sent-order', '{oops')
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('There is no order to show here.')).toBeInTheDocument()
  })

  it('shows the empty state when sessionStorage throws on read and nothing is held', () => {
    // catches: a blocked read crashing the confirmation address
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('There is no order to show here.')).toBeInTheDocument()
  })

  it('shows the newest order after a second send in the same tab', () => {
    // catches: the page keeping the first order's number, lines or contact line
    writeSentOrder(order)
    writeSentOrder({ ...order, number: 'PF-20261029-ABCD', contact: { ...order.contact!, email: 'new@mail.com' } })
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('PF-20261029-ABCD')).toBeInTheDocument()
    expect(screen.queryByText('PF-20261028-4K7Q')).not.toBeInTheDocument()
    expect(screen.getByText(/contact you at new@mail\.com or/)).toBeInTheDocument()
  })

  it('shows the same order after the page is drawn again, as after a reload or print', () => {
    // catches: a read that empties the store, so a second draw shows "no order"
    writeSentOrder(order)
    const first = render(<ConfirmationScreen onBack={() => {}} />)
    first.unmount()
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText('PF-20261028-4K7Q')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('pem-pf-store:sent-order')).not.toBeNull()
  })

  it('shows text typed by the buyer as text, not as markup', () => {
    // catches: a name or club injected as HTML into the page
    writeSentOrder({ ...order, contact: { ...order.contact!, name: '<img src=x onerror=alert(1)>' } })
    const { container } = render(<ConfirmationScreen onBack={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})

describe('ConfirmationScreen earlier order', () => {
  const NOTE = 'This order reached us before your changes, so your changes were not sent. Anything still in your cart can go in a new order.' // the note's text

  it('shows the Earlier order note under the heading and above the number card only with changesNotSent', () => {
    // catches: a note on an ordinary order, or one that is missing when the changes were not sent
    writeSentOrder({ ...order, changesNotSent: true })
    const { unmount } = render(<ConfirmationScreen onBack={() => {}} />)
    const note = screen.getByText(NOTE)
    const heading = screen.getByRole('heading', { name: 'Order sent' })
    const card = screen.getByText('Order number')
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // after the heading
    expect(note.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // before the number card
    unmount()
    writeSentOrder(order)
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument() // none for a plain order
  })

  it('names no honors and no email in the note', () => {
    // catches: the word honor on screen, or a claim that the buyer gets an email
    writeSentOrder({ ...order, changesNotSent: true })
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText(NOTE).textContent).not.toMatch(/honou?r|e-?mail/i)
  })

  it('shows the contact-free line and no Name or Phone rows when the contact is null', () => {
    // catches: a contact printed that the order may not hold
    writeSentOrder({ ...order, contact: null, changesNotSent: true })
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByText(/Keep this number/)).toHaveTextContent("Keep this number. We'll review your order and contact you to confirm it. Thank you!")
    expect(screen.queryByText('Name')).not.toBeInTheDocument()
    expect(screen.queryByText('Phone')).not.toBeInTheDocument()
    expect(screen.getByText('Club')).toBeInTheDocument() // the club row stays
    expect(screen.getByText('Eagles')).toBeInTheDocument()
  })

  it('still focuses the heading on arrival with the note showing', () => {
    // catches: the added note stealing or losing the arrival focus
    writeSentOrder({ ...order, contact: null, changesNotSent: true })
    render(<ConfirmationScreen onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Order sent' })).toHaveFocus()
  })
})
