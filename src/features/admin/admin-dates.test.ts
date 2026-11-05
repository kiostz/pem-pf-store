// Tests for the admin's date text: the short "changed" date on a row and the full time on the sheet, both in Malaysia time.

import { describe, expect, it } from 'vitest' // test API
import { formatAdminTime, formatChangedShort } from './admin-dates.ts' // the code under test

const NOW = new Date('2026-11-03T04:00:00.000Z') // 3 Nov 2026, noon in Malaysia

describe('formatChangedShort', () => {
  it('writes "changed 3 Nov" in the current year and adds the year outside it', () => {
    // Catches a year on every row, or a missing year on an old one.
    expect(formatChangedShort('2026-11-03T02:00:00.000Z', NOW)).toBe(
      'changed 3 Nov',
    )
    expect(formatChangedShort('2025-11-03T02:00:00.000Z', NOW)).toBe(
      'changed 3 Nov 2025',
    )
  })

  it('shows a UTC time on 2 Nov after 16:00 as 3 Nov, the day in Malaysia', () => {
    // Catches the day being read in UTC or the browser's zone, not Malaysia's.
    expect(formatChangedShort('2026-11-02T16:30:00.000Z', NOW)).toBe(
      'changed 3 Nov',
    )
  })

  it('judges the year in Malaysia time too', () => {
    // Catches New Year's Eve evening UTC being counted as the old year.
    expect(
      formatChangedShort(
        '2026-12-31T17:00:00.000Z',
        new Date('2027-01-01T01:00:00.000Z'),
      ),
    ).toBe('changed 1 Jan')
  })
})

describe('formatAdminTime', () => {
  it('writes the day, the year and the time in Malaysia with a lowercase am or pm', () => {
    // Catches UTC time on the sheet (midnight for the import), or an uppercase PM.
    expect(formatAdminTime('2026-11-01T00:00:00.000Z')).toBe(
      '1 Nov 2026, 8:00 am',
    )
    expect(formatAdminTime('2026-11-03T09:05:00.000Z')).toBe(
      '3 Nov 2026, 5:05 pm',
    )
  })
})
