// The admin page's shell: the oxblood header with the theme control, the tab bar, and the four screens in a 768 px column, with Items kept mounted so its pending changes survive a tab change.

import { useState } from 'react' // the pending count
import { STORE_NAME } from '@/shared/store-name.ts' // the store's name
import { ThemeControl } from '@/shared/theme/ThemeControl.tsx' // the sun or moon button
import { AdminTabs } from './AdminTabs.tsx' // Items, Orders, Clubs, Settings
import { ClubsScreen } from './ClubsScreen.tsx' // the Clubs screen
import { ItemsScreen } from './ItemsScreen.tsx' // the Items screen
import { OrdersScreen } from './OrdersScreen.tsx' // the Orders screen
import { SettingsScreen } from './SettingsScreen.tsx' // the Settings screen
import { useAdminRoute } from './use-admin-route.ts' // the open tab

const TITLES = { items: 'Items', orders: 'Orders', clubs: 'Clubs', settings: 'Settings' } as const // the header title follows the tab

/**
 * Draws the page.
 * @return the header, the tab bar and the open screen
 */
export function AdminApp() {
  const { tab, number } = useAdminRoute() // where the admin is
  const [itemsPending, setItemsPending] = useState(0) // edited fields waiting on Items
  return (
    <>
      {/* The same header grid as the Shop: 44 px, title, 44 px. */}
      <header className="bg-header text-on-header">
        <div className="mx-auto grid max-w-3xl grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 py-3">
          <span /> {/* an empty left slot keeps the title centred */}
          <div className="text-center">
            <p className="text-sm font-medium">{STORE_NAME}</p> {/* small name over the screen title */}
            <h1 className="text-base font-bold">{TITLES[tab]}</h1> {/* the screen's title */}
          </div>
          <div className="flex justify-end">
            <ThemeControl /> {/* light or dark */}
          </div>
        </div>
      </header>
      <AdminTabs tab={tab} itemsPending={itemsPending} />
      {/* The screens; the bottom clearance on Items keeps the last row above the pill and its note. */}
      <main className={`mx-auto max-w-3xl px-4 pt-6 ${tab === 'items' ? 'pb-52' : 'pb-16'}`}>
        {/* Items stays mounted and hidden elsewhere: its edits, leave warning and scroll position stay. */}
        <div hidden={tab !== 'items'}>
          <ItemsScreen onPendingCount={setItemsPending} />
        </div>
        {tab === 'orders' && <OrdersScreen key={number ?? ''} number={number} />} {/* mounts fresh on each visit */}
        {tab === 'clubs' && <ClubsScreen />} {/* mounts fresh on each visit */}
        {tab === 'settings' && <SettingsScreen />}
      </main>
    </>
  )
}
