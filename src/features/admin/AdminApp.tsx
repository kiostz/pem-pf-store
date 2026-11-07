// The admin page's shell: the oxblood header with the theme control, the tab bar, and the four screens in a 768 px column, with Items kept mounted so its pending changes survive a tab change.

import { useState } from 'react' // the pending count
import type { PriceSettings } from '../../../workers/admin/src/admin-types.ts' // the saved currency and price
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
  const [restocks, setRestocks] = useState(0) // cancels that put stock back, counted so Items loads again
  const [prices, setPrices] = useState<PriceSettings | null>(null) // the currency and default price last saved on Settings
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
          {/* the restock count makes Items load again after a restocking cancel */}
          <ItemsScreen onPendingCount={setItemsPending} prices={prices} restocks={restocks} />
        </div>
        {tab === 'orders' && <OrdersScreen key={number ?? ''} number={number} onRestocked={() => setRestocks((count) => count + 1)} />} {/* mounts fresh on each visit */}
        {tab === 'clubs' && <ClubsScreen />} {/* mounts fresh on each visit */}
        {tab === 'settings' && <SettingsScreen onPricesSaved={setPrices} />}
      </main>
    </>
  )
}
