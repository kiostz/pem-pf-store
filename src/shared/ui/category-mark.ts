// Colours and icon of the category mark, one per category in one map so retuning a category is one line; the colours are the club's category colours, tuned for contrast.

// Names of the icons the mark can show.
export type CategoryIconName =
  | 'award' // Tabler icon name
  | 'shirt' // Tabler icon name
  | 'neckerchief' // our own icon, drawn in Tabler's outline style

type CategoryMark = {
  icon: CategoryIconName // which icon to draw
  background: string // the category's colour, filling the square
  foreground: string // icon colour
} // what one mark shows

const iconNearBlack = '#171717' // icon colour on the light background
const iconWhite = '#ffffff' // icon colour everywhere else

const marks: Record<string, CategoryMark> = {
  // one entry per category, keyed by its exact name
  Accessories: { // slate with a neckerchief
    icon: 'neckerchief', // our own icon
    background: '#2f4858', // slate, a dark colour
    foreground: iconWhite, // a white icon reads on it
  },
  Honors: { // forest green with an award
    icon: 'award', // the Tabler award
    background: '#1f5f3a', // forest green, a dark colour
    foreground: iconWhite, // a white icon reads on it (7.6:1)
  },
  Shirts: { // khaki with a shirt
    icon: 'shirt', // the Tabler shirt
    background: '#c3b091', // khaki, a light colour
    foreground: iconNearBlack, // a near-black icon reads on it
  },
} // the three categories

const defaultMark: CategoryMark = {
  icon: 'award', // generic award icon
  background: '#525252', // neutral grey
  foreground: iconWhite, // white reads on the grey
} // an unknown or blank category

/**
 * Looks up the mark of a category.
 * @param category exact category name
 * @return icon name and hex colours; the grey award mark for an unknown or blank name
 */
export function categoryMark(category: string): CategoryMark {
  return Object.hasOwn(marks, category) ? marks[category] : defaultMark // hasOwn keeps "constructor" from matching
}
