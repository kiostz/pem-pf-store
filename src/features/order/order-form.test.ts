// Tests for the order form rules: validation, the missing-fields line, the club text for the email and the club's grey line.

import { describe, expect, it } from 'vitest' // test API
import type { Club } from '@/shared/data/types.ts' // the club shape
import {
  clubDetails,
  clubText,
  missingText,
  OTHER_CLUB,
  validateOrderForm,
  type OrderFormValues,
} from './order-form.ts' // code under test

const clubs: Club[] = [
  {
    name: 'Eagles',
    area: 'Klang',
    language: 'BM',
    location: null,
    churchName: 'Klang BM SDA Church',
  },
  {
    name: 'Sunway Club',
    area: null,
    language: null,
    location: null,
    churchName: null,
  },
] // two clubs, one with details
const valid: OrderFormValues = {
  name: 'Jo Tan',
  email: 'jc@mail.com',
  phone: '0312345678',
  club: 'Eagles',
  otherClub: '',
} // a complete form

/**
 * Makes the valid form with some fields changed.
 * @param change the fields to override
 * @return the form values
 */
const form = (change: Partial<OrderFormValues>): OrderFormValues => ({
  ...valid,
  ...change,
})

describe('validateOrderForm', () => {
  it('returns no errors for a complete form', () => {
    // catches: a valid form refused
    expect(validateOrderForm(valid, clubs)).toEqual({})
  })

  it('errs on each empty field', () => {
    // catches: a required field that lets an empty value through
    const errors = validateOrderForm(
      { name: '', email: '', phone: '', club: '', otherClub: '' },
      clubs,
    )
    expect(Object.keys(errors).sort()).toEqual([
      'club',
      'email',
      'name',
      'phone',
    ])
  })

  it('errs on a spaces-only name', () => {
    // catches: whitespace counted as a name because the value is not trimmed
    expect(validateOrderForm(form({ name: '   ' }), clubs).name).toBe(
      'Enter your name, up to 100 characters.',
    )
  })

  it('accepts a name of 100 characters and refuses 101', () => {
    // catches: an off-by-one on the name limit
    expect(
      validateOrderForm(form({ name: 'a'.repeat(100) }), clubs).name,
    ).toBeUndefined()
    expect(validateOrderForm(form({ name: 'a'.repeat(101) }), clubs).name).toBe(
      'Enter your name, up to 100 characters.',
    )
  })

  it('refuses a@b and accepts jc@mail.com', () => {
    // catches: an email rule that is too loose or too strict
    expect(validateOrderForm(form({ email: 'a@b' }), clubs).email).toBe(
      'Enter an email like name@example.com.',
    )
    expect(
      validateOrderForm(form({ email: 'jc@mail.com' }), clubs).email,
    ).toBeUndefined()
  })

  it('refuses an email longer than 254 characters', () => {
    // catches: no upper limit on the email
    expect(
      validateOrderForm(form({ email: `${'a'.repeat(250)}@b.co` }), clubs)
        .email,
    ).toBeDefined()
  })

  it.each(['+60 12-345 6789', '0312345678', '(03) 1234 5678'])(
    'accepts the phone %s',
    (phone) => {
      // catches: a strict phone rule refusing a real number
      expect(validateOrderForm(form({ phone }), clubs).phone).toBeUndefined()
    },
  )

  it.each(['12345', '1'.repeat(16), 'abc1234567'])(
    'refuses the phone %s',
    (phone) => {
      // catches: too short, too long or lettered numbers accepted
      expect(validateOrderForm(form({ phone }), clubs).phone).toBe(
        'Enter a phone number with 7 to 15 digits.',
      )
    },
  )

  it('needs a club name when Other is chosen', () => {
    // catches: Other accepted with nothing typed
    const errors = validateOrderForm(
      form({ club: OTHER_CLUB, otherClub: '  ' }),
      clubs,
    )
    expect(errors.otherClub).toBe('Enter your club name, up to 100 characters.')
    expect(errors.club).toBeUndefined()
  })

  it('accepts Other with a name and refuses 101 characters', () => {
    // catches: the club name limit missing
    expect(
      validateOrderForm(
        form({ club: OTHER_CLUB, otherClub: 'Hilltop Club' }),
        clubs,
      ),
    ).toEqual({})
    expect(
      validateOrderForm(
        form({ club: OTHER_CLUB, otherClub: 'a'.repeat(101) }),
        clubs,
      ).otherClub,
    ).toBeDefined()
  })

  it('needs only a club name when the club list is empty', () => {
    // catches: a required dropdown that cannot be filled because there are no clubs
    expect(
      validateOrderForm(form({ club: '', otherClub: '' }), []).otherClub,
    ).toBeDefined()
    expect(
      validateOrderForm(form({ club: '', otherClub: '' }), []).club,
    ).toBeUndefined()
    expect(
      validateOrderForm(form({ club: '', otherClub: 'Hilltop Club' }), []),
    ).toEqual({})
  })

  it('refuses a club that is not in the list', () => {
    // catches: a stale chosen club still accepted after the list changed
    expect(validateOrderForm(form({ club: 'Gone Club' }), clubs).club).toBe(
      'Choose your club.',
    )
  })
})

describe('missingText', () => {
  it('is null when nothing is missing', () => {
    // catches: a missing line shown on a complete form
    expect(missingText({}, true)).toBeNull()
  })

  it('names the fields and the captcha', () => {
    // catches: a line that does not say why Send order looks disabled
    expect(missingText({ phone: 'x' }, false)).toBe(
      'Fill in your phone and complete the captcha to send.',
    )
  })

  it('names only the captcha when the fields are fine', () => {
    // catches: "Fill in" with nothing to fill in
    expect(missingText({}, false)).toBe('Complete the captcha to send.')
  })

  it('joins several fields and calls the Other field the club name', () => {
    // catches: a clumsy list or the wrong label for the Other field
    expect(missingText({ name: 'x', email: 'x', otherClub: 'x' }, true)).toBe(
      'Fill in your name, email and club name to send.',
    )
  })
})

describe('clubText', () => {
  it('gives a listed club by name only, even when it has details', () => {
    // catches: the four fields leaking into the email
    expect(clubText(form({ club: 'Eagles' }))).toEqual({
      subject: 'Eagles',
      email: 'Eagles',
    })
  })

  it('marks Other in the email and leaves the subject plain', () => {
    // catches: Other shown as the word "other" or without its name
    expect(
      clubText(form({ club: OTHER_CLUB, otherClub: ' Hilltop Club ' })),
    ).toEqual({
      subject: 'Hilltop Club',
      email: 'Other: Hilltop Club',
    })
  })

  it('treats an empty club list as Other', () => {
    // catches: an empty club with a typed name sending a blank club
    expect(clubText(form({ club: '', otherClub: 'Hilltop Club' }))).toEqual({
      subject: 'Hilltop Club',
      email: 'Other: Hilltop Club',
    })
  })
})

describe('clubDetails', () => {
  it('shows a church name alone', () => {
    // catches: a stray separator round a single field
    expect(
      clubDetails({
        name: 'G',
        area: null,
        language: null,
        location: null,
        churchName: 'Klang BM SDA Church',
      }),
    ).toBe('Klang BM SDA Church')
  })

  it('joins all four in order with a middle dot', () => {
    // catches: fields in the wrong order
    expect(
      clubDetails({
        name: 'G',
        area: 'Klang',
        language: 'BM',
        location: 'Hall',
        churchName: 'Church',
      }),
    ).toBe('Klang · BM · Hall · Church')
  })

  it('leaves no gap for the fields that are null', () => {
    // catches: an empty part left between separators
    expect(
      clubDetails({
        name: 'G',
        area: 'Klang',
        language: null,
        location: null,
        churchName: 'Church',
      }),
    ).toBe('Klang · Church')
  })

  it('is null when all four are null', () => {
    // catches: an empty grey line drawn for a club with no details
    expect(
      clubDetails({
        name: 'G',
        area: null,
        language: null,
        location: null,
        churchName: null,
      }),
    ).toBeNull()
  })
})
