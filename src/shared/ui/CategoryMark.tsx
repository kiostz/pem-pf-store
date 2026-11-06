// The category mark: a square in the category's patch colour with its icon, shown where an item has no picture, so every row has the same 56 px lead.

import { categoryMark } from './category-mark.ts' // colours and icon of a category
import { CategoryIcon } from './CategoryIcon.tsx' // draws the icon

/**
 * Draws the mark of one category.
 * @param category exact category name; an unknown one gets the default mark
 * @param size 'row' for a 56 px square with a 28 px icon (the default), 'card' for 112 px and 48 px
 * @return a square with a hairline border and an icon
 */
export function CategoryMark({ category, size = 'row' }: { category: string; size?: 'row' | 'card' }) {
  const { icon, background, foreground } = categoryMark(category) // hex colours from the one map
  return (
    // Inline style because the colours are data, the same in light and dark mode; the border token changes with the mode.
    <div
      data-testid="category-mark"
      aria-hidden="true"
      style={{ backgroundColor: background, color: foreground }}
      // Square size and icon size follow the card or row size.
      className={`border-category-mark-border flex ${size === 'card' ? 'size-28' : 'size-14'} shrink-0 items-center justify-center rounded-md border`}
    >
      {/* The category's icon, 48 px on a card, 28 px in a row. */}
      <CategoryIcon name={icon} className={size === 'card' ? 'size-12' : 'size-7'} />
    </div>
  )
}
