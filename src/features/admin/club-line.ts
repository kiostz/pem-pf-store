// The grey details line of a club, shared by the Clubs row and the Club sheet's conflict line so both read the same.

import type { ClubFields } from '../../../workers/admin/src/admin-types.ts' // the fields

/**
 * Joins a club's filled details.
 * @param club the club's fields
 * @return "Klang · English · Phoenix SDA Church", or '' when all four details are blank
 */
export const clubDetails = (club: ClubFields): string =>
  [club.area, club.language, club.location, club.churchName].filter((part) => part !== null).join(' · ') // the filled ones, in the shop's order
