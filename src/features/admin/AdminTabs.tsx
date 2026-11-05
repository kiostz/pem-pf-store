// The admin's tab bar: three links (Items, Orders, Settings), each an address, with the current one marked and a dot on Items while changes wait to be saved.

import type { AdminTab } from './use-admin-route.ts' // the tab names

const TABS: ReadonlyArray<{ tab: AdminTab; label: string }> = [
  { tab: 'items', label: 'Items' },
  { tab: 'orders', label: 'Orders' },
  { tab: 'settings', label: 'Settings' },
] // the bar, in order

/**
 * Draws the bar.
 * @param tab the open tab
 * @param itemsPending how many edited fields wait on the Items screen
 * @return a navigation of three 44 px links
 */
export function AdminTabs({ tab, itemsPending }: { tab: AdminTab; itemsPending: number }) {
  return (
    // A nav of links, not ARIA tabs: each tab is an address.
    <nav aria-label="Admin" className="border-border-subtle bg-bg-app border-b">
      <ul className="mx-auto grid max-w-3xl grid-cols-3 gap-1 px-4 py-2">
        {TABS.map(({ tab: name, label }) => (
          <li key={name}>
            <a
              href={`#/${name}`} // the tab's address
              aria-current={tab === name ? 'page' : undefined} // marks the open one
              className={`focus-visible:outline-focus-ring rounded-pill flex min-h-11 items-center justify-center gap-2 transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-2 ${tab === name ? 'bg-bg-soft text-accent font-bold' : 'text-text-muted font-medium'}`} // the open tab sits on the soft capsule in oxblood
            >
              {label}
              {name === 'items' && itemsPending > 0 && (
                <>
                  <span aria-hidden="true" className="bg-accent size-2 rounded-full" /> {/* the oxblood pending dot */}
                  <span className="sr-only">changes not saved</span> {/* its words */}
                </>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
