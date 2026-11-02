// The order form's rules: the values, what makes them valid, the line that says what is missing, and the club's text for the email and the dropdown.

import type { Club, ClubList } from '@/shared/data/types.ts' // the club shapes

export const OTHER_CLUB = 'other' // the select's value for a club typed by hand

// What the buyer has typed or chosen; club is a club name, '' or OTHER_CLUB.
export type OrderFormValues = {
  name: string // the buyer's name
  email: string // the buyer's email address
  phone: string // the buyer's phone number
  club: string // a listed club's name, '' or OTHER_CLUB
  otherClub: string // the club typed by hand, used with OTHER_CLUB
}

// One field of the form.
export type OrderField = keyof OrderFormValues

export const EMPTY_ORDER_FORM: OrderFormValues = {
  name: '', // nothing typed
  email: '', // nothing typed
  phone: '', // nothing typed
  club: '', // nothing chosen
  otherClub: '', // nothing typed
} // a form nothing is typed in

const NAME_MAX = 100 // longest name or club name
const EMAIL_MAX = 254 // longest email address
const NAME_ERROR = 'Enter your name, up to 100 characters.' // under Name
const EMAIL_ERROR = 'Enter an email like name@example.com.' // under Email
const PHONE_ERROR = 'Enter a phone number with 7 to 15 digits.' // under Phone
const CLUB_ERROR = 'Choose your club.' // under Club
const OTHER_CLUB_ERROR = 'Enter your club name, up to 100 characters.' // under Club name

/**
 * Checks the form and says what is wrong, field by field.
 * @param values what the buyer has typed or chosen
 * @param clubs the clubs in the dropdown; with none, only the club name is asked for
 * @return an error text per invalid field; empty when the form is valid
 */
export function validateOrderForm(
  values: OrderFormValues,
  clubs: ClubList,
): Partial<Record<OrderField, string>> {
  const errors: Partial<Record<OrderField, string>> = {} // grows with each failed rule
  const name = values.name.trim() // spaces round a name do not count
  if (name.length < 1 || name.length > NAME_MAX) errors.name = NAME_ERROR // required, up to 100
  const email = values.email.trim() // spaces round an address do not count
  if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = EMAIL_ERROR // something@something.something
  const phone = values.phone
    .trim()
    .replace(/^\+/, '')
    .replace(/[\s\-()]/g, '') // a leading + and the usual separators are not digits
  if (!/^\d{7,15}$/.test(phone)) errors.phone = PHONE_ERROR // digits only, 7 to 15
  const typedClub = clubs.length === 0 || values.club === OTHER_CLUB // no list means the club is always typed
  if (typedClub) {
    const otherClub = values.otherClub.trim() // spaces round a club name do not count
    if (otherClub.length < 1 || otherClub.length > NAME_MAX)
      errors.otherClub = OTHER_CLUB_ERROR // required, up to 100
  } else if (!clubs.some((club) => club.name === values.club))
    errors.club = CLUB_ERROR // nothing chosen, or a club that left the list
  return errors
}

/**
 * Words what keeps Send order from being ready, for the line under the button.
 * @param errors the result of validateOrderForm
 * @param hasToken whether the captcha is solved
 * @return the line, or null when nothing is missing
 */
export function missingText(
  errors: Partial<Record<OrderField, string>>,
  hasToken: boolean,
): string | null {
  const labels = [
    errors.name && 'name', // each missing field, in form order
    errors.email && 'email', // the email is missing or wrong
    errors.phone && 'phone', // the phone is missing or wrong
    errors.club && 'club', // no club chosen
    errors.otherClub && 'club name', // the typed club name is missing
  ].filter((label): label is string => typeof label === 'string') // drop the fields that are fine
  const joined =
    labels.length > 1 // two or more need an "and"
      ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` // "a, b and c"
      : labels.join('') // one label, or none
  if (labels.length === 0) return hasToken ? null : 'Complete the captcha to send.' // only the captcha, or nothing
  return `Fill in your ${joined}${hasToken ? '' : ' and complete the captcha'} to send.` // fields, then the captcha
}

/**
 * Gives the club's name for the email, never its four detail fields.
 * @param values the form
 * @return the club name for the subject and for the email body ("Other: " first when typed by hand)
 */
export function clubText(values: OrderFormValues): {
  subject: string
  email: string
} {
  if (values.club !== OTHER_CLUB && values.club !== '')
    return { subject: values.club, email: values.club } // a listed club
  const typed = values.otherClub.trim() // the club typed by hand
  return { subject: typed, email: `Other: ${typed}` } // flagged as typed
}

/**
 * Joins a club's four optional fields into the grey line under its name.
 * @param club the club
 * @return area, language, location and church name joined with " · ", skipping the null ones; null when all are null
 */
export function clubDetails(club: Club): string | null {
  const parts = [
    club.area, // first
    club.language, // second
    club.location, // third
    club.churchName, // last
  ].filter((part): part is string => part !== null) // in the fixed order
  return parts.length === 0 ? null : parts.join(' · ') // no line for a club with no details
}

/**
 * Collapses line breaks, control characters and the Unicode line and paragraph separators in typed text to spaces, so a field cannot add lines to an order.
 * @param text what the buyer typed
 * @return the text with each run of control characters as one space, trimmed
 */
export function oneLine(text: string): string {
  return text.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim() // controls include \r and \n; Zl and Zp are U+2028 and U+2029
}
