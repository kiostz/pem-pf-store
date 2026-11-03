// Colours and icon of the category mark, in one map so retuning a category is one line; hex because they match the real patch backgrounds in both modes.

// Names of the Tabler outline icons the mark can show.
export type CategoryIconName =
  | 'heart-handshake' // Tabler icon name
  | 'palette' // Tabler icon name
  | 'microscope' // Tabler icon name
  | 'tools-kitchen-2' // Tabler icon name
  | 'leaf' // Tabler icon name
  | 'plant-2' // Tabler icon name
  | 'world' // Tabler icon name
  | 'tent' // Tabler icon name
  | 'tool' // Tabler icon name
  | 'award' // Tabler icon name
  | 'shirt' // Tabler icon name
  | 'neckerchief' // our own icon, drawn in Tabler's outline style

type CategoryMark = {
  icon: CategoryIconName // which icon to draw
  background: string // patch colour of the square
  foreground: string // icon colour
  strongHalo?: boolean // true when white lettering on this colour needs the stronger halo (a mid-tone patch colour)
} // what one mark shows

const iconNearBlack = '#171717' // icon colour on the light patch backgrounds
const iconWhite = '#ffffff' // icon colour everywhere else

const marks: Record<string, CategoryMark> = {
  // one entry per known category, keyed by its exact name
  ADRA: {
    icon: 'heart-handshake', // the category's icon
    background: '#483977', // measured patch colour
    foreground: iconWhite, // icon colour that reads on it
  },
  'Arts and Crafts': {
    // multi-line entry
    icon: 'palette', // the category's icon
    background: '#4f8db1', // measured patch colour
    foreground: iconWhite, // icon colour that reads on it
    strongHalo: true, // white is only 3.6:1 here, so a tile name needs the stronger halo
  },
  'Health and Science': {
    // multi-line entry
    icon: 'microscope', // the category's icon
    background: '#533868', // measured patch colour
    foreground: iconWhite, // icon colour that reads on it
  },
  'Household Arts': {
    // multi-line entry
    icon: 'tools-kitchen-2', // the category's icon
    background: '#f6a949', // measured patch colour
    foreground: iconNearBlack, // icon colour that reads on it
  },
  Nature: { icon: 'leaf', background: '#f0f2ed', foreground: iconNearBlack }, // one-line entry
  'Outdoor Industries': {
    // multi-line entry
    icon: 'plant-2', // the category's icon
    background: '#4b3211', // measured patch colour
    foreground: iconWhite, // icon colour that reads on it
  },
  Outreach: { icon: 'world', background: '#2a3578', foreground: iconWhite }, // one-line entry
  Recreation: { icon: 'tent', background: '#117155', foreground: iconWhite }, // one-line entry
  Vocational: { icon: 'tool', background: '#d0272a', foreground: iconWhite }, // one-line entry
  Shirt: { icon: 'shirt', background: '#c3b091', foreground: iconNearBlack }, // khaki, a light patch colour, so a near-black icon
  Accessories: {
    // multi-line entry
    icon: 'neckerchief', // our own icon
    background: '#2f4858', // slate, a dark patch colour
    foreground: iconWhite, // a white icon reads on it
  },
} // measured from the patch pictures

const defaultMark: CategoryMark = {
  icon: 'award', // generic award icon
  background: '#525252', // neutral grey
  foreground: iconWhite, // white reads on the grey
} // club-added or blank category

/**
 * Looks up the mark of a category.
 * @param category exact category name
 * @return icon name and hex colours; the grey award mark for an unknown or blank name
 */
export function categoryMark(category: string): CategoryMark {
  return Object.hasOwn(marks, category) ? marks[category] : defaultMark // hasOwn keeps "constructor" from matching
}
