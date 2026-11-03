// Class strings the admin screens share, so the toolbar, the sheet and the dialogs draw one field and one note action.

export const FIELD_BOX =
  'border-border-subtle bg-bg-surface text-text-default focus-visible:outline-focus-ring rounded-pill min-h-11 border px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2' // a 44 px field, 16 px text so iOS does not zoom

export const NOTE_BUTTON =
  'focus-visible:outline-focus-ring rounded-pill min-h-11 shrink-0 px-4 font-bold transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-0 active:scale-[0.97]' // a 44 px action inside a note

export const SHEET_BOX =
  'bg-bg-surface text-text-default rounded-t-card fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto border-0 p-4 shadow-none backdrop:bg-black/50 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-120 sm:rounded-b-card animate-note-in motion-reduce:animate-fade-in' // a bottom sheet at 375 px and a 480 px card from 640 px

export const SOFT_BUTTON =
  'bg-bg-soft text-accent focus-visible:outline-focus-ring rounded-pill inline-flex min-h-11 items-center justify-center px-5 font-medium transition-transform duration-(--duration-press) focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97]' // the quiet 44 px action: soft fill, oxblood text
