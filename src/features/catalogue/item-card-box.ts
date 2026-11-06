// The class strings of the catalogue grid and one card, shared by the real cards and the loading cards so the list does not jump when data arrives.

export const CARD_GRID_BOX =
  'grid grid-cols-1 gap-3 min-[348px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' // 1 column under 348 px, where two columns would be too narrow for the 134 px stepper, 2 from 348 px, 5 from 1,024 px up
export const CARD_BOX =
  'bg-bg-surface border-border-subtle rounded-card flex flex-col items-center gap-2 border p-2 sm:p-3' // a white card with a hairline, its parts stacked; tight padding on phones so the stepper fits two across
