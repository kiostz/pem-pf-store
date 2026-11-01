// The admin page's shell: the oxblood header with the theme control, and the Items screen in a 768 px column.

import { STORE_NAME } from '@/shared/store-name.ts' // the store's name
import { ThemeControl } from '@/shared/theme/ThemeControl.tsx' // the sun or moon button
import { ItemsScreen } from './ItemsScreen.tsx' // the one screen

/**
 * Draws the page.
 * @return the header and the Items screen
 */
export function AdminApp() {
  return (
    <>
      {/* The same header grid as the Shop: 44 px, title, 44 px. */}
      <header className="bg-header text-on-header">
        <div className="mx-auto grid max-w-3xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 py-3">
          <span /> {/* an empty left slot keeps the title centred */}
          <div className="text-center">
            <p className="text-sm font-medium">{STORE_NAME}</p> {/* small name over the screen title */}
            <h1 className="text-base font-bold">Items</h1> {/* the screen's title */}
          </div>
          <div className="flex justify-end">
            <ThemeControl /> {/* light or dark */}
          </div>
        </div>
      </header>
      {/* The one screen; the bottom clearance keeps the last row above the pill and its note. */}
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-52">
        <ItemsScreen />
      </main>
    </>
  )
}
