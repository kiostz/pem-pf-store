// App shell: the site header and the screen the address names (Home, shop, cart, details page or order confirmation), so every screen hangs off one frame.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react' // scroll, focus and title around a screen change, and the click's type
import { CartProvider } from '@/features/cart/CartProvider.tsx' // the cart state
import { CartScreen } from '@/features/cart/CartScreen.tsx' // the cart screen
import { Catalogue } from '@/features/catalogue/Catalogue.tsx' // the buyer's list of items
import { useCatalogueData } from '@/features/catalogue/use-catalogue-data.ts' // the one load
import { ConfirmationScreen } from '@/features/order/ConfirmationScreen.tsx' // the screen after a sent order
import { HomeScreen } from '@/features/home/HomeScreen.tsx' // the landing page
import { DetailsScreen } from '@/features/order/DetailsScreen.tsx' // the order form's page
import { OrderFormProvider } from '@/features/order/OrderFormProvider.tsx' // the order form's values, kept across screens
import { CART_HASH, CATALOGUE_HASH, shopHash } from '@/shared/routes.ts' // the shop's and the cart's addresses
import { STORE_NAME } from '@/shared/store-name.ts' // the store's name
import { AppHeader } from './AppHeader.tsx' // the header band
import { TabPill } from './TabPill.tsx' // the floating Home, Shop and Cart tabs
import { useHashRoute, useShopCategory } from './use-hash-route.ts' // which screen the address names, and the shop's category

const TAB_PILL_SELECTOR = 'nav[aria-label="Main"]' // the tab pill, to tell whether focus is on a tab
const FROM_CART_STATE = { fromCart: true } // marks a details history entry Checkout pushed, so history back leads to the cart

/**
 * The whole page: header and the screen the address names.
 * @return the app shell
 */
export function App() {
  const data = useCatalogueData() // one load feeds the catalogue, the bar and the cart screen
  const route = useHashRoute() // the screen the address names
  const category = useShopCategory() // the category the address names
  const [shop, setShop] = useState<{ category: string | null; key: number }>({ category: null, key: 0 }) // the category the grid shows, and a key that remounts it on a fresh arrival
  const lastKey = useRef(shop.key) // the key at the last screen change
  const lastRoute = useRef(route) // the screen before this one
  const tabClicked = useRef(false) // set by the Cart tab's click, read when the cart's history entry exists
  const browsed = useRef(false) // set by the empty cart's Browse more, so focus goes to the page and not to the Cart tab
  const catalogueScroll = useRef(0) // where the catalogue was scrolled to
  // A different category from the one shown, arriving by tile or typed address, remounts the grid (empty search, top of the page); a pick in the dropdown has already set it.
  if (route === 'catalogue' && category !== shop.category) setShop({ category, key: shop.key + 1 })
  const cartTabRef = useRef<HTMLAnchorElement>(null) // the Cart tab's link, focused on return
  const mainRef = useRef<HTMLElement>(null) // focused on return when the cart is empty

  // The app restores scroll itself, so the browser must not do it too, later and from a clamped value.
  useEffect(() => {
    window.history.scrollRestoration = 'manual' // once, for the whole page life
  }, [])

  // Remember the catalogue's scroll while it shows; layout effect so it stops listening as the catalogue is hidden, before the browser's next frame.
  useLayoutEffect(() => {
    if (route !== 'catalogue') return // the cart has its own top
    /** Saves where the catalogue is scrolled to. */
    const remember = () => {
      catalogueScroll.current = window.scrollY // the latest position
    }
    window.addEventListener('scroll', remember, { passive: true }) // cheap listener
    return () => window.removeEventListener('scroll', remember) // stop as the catalogue is hidden
  }, [route])

  // On a screen change: set the scroll and the focus, and note where the cart came from.
  useLayoutEffect(() => {
    const previous = lastRoute.current // the screen just left
    lastRoute.current = route // for the next change
    const fresh = lastKey.current !== shop.key // the grid was remounted: it starts at the top
    lastKey.current = shop.key // for the next change
    if (fresh) catalogueScroll.current = 0 // nothing to come back to
    if (previous === route) {
      if (fresh && route === 'catalogue') window.scrollTo(0, 0) // a typed address with another category
      return // first draw or nothing changed
    }
    if (route === 'cart') {
      if (tabClicked.current) window.history.replaceState({ fromTab: true, fromShop: previous === 'catalogue' }, '') // this entry follows a tab one, and says whether that was Shop
      tabClicked.current = false // only this opening
      window.scrollTo(0, 0) // the cart opens at its top (its heading takes focus itself)
    } else if (route === 'details') {
      if (previous === 'cart') window.history.replaceState(FROM_CART_STATE, '') // this entry follows the cart one (Checkout pushed it)
      window.scrollTo(0, 0) // the details page opens at its top (its heading takes focus itself)
    } else if (route === 'order-sent') {
      window.scrollTo(0, 0) // the confirmation opens at its top (its heading takes focus itself)
    } else {
      if (route === 'home') window.scrollTo(0, 0) // Home opens at its top
      else window.scrollTo(0, catalogueScroll.current) // back to where the buyer was, or the top after a fresh arrival
      const cartTab = cartTabRef.current // the Cart tab, drawn in this same commit
      if (previous === 'cart' && !browsed.current && cartTab)
        cartTab.focus() // back from the cart: where the buyer left from
      else if (!document.activeElement?.closest(TAB_PILL_SELECTOR))
        mainRef.current?.focus({ preventScroll: true }) // the link or tile that led here is gone; never the search box, where a phone keyboard would open
      // else a tab was tapped: focus stays on it
    }
    browsed.current = false // only this arrival
  }, [route, shop.key])

  // The tab title follows the screen.
  useEffect(() => {
    document.title =
      route === 'cart' // the cart screen
        ? `Your cart · ${STORE_NAME}` // names the cart
        : route === 'details' // the details page
          ? `Your details · ${STORE_NAME}` // names the details page
          : route === 'order-sent' // the confirmation
            ? `Order sent · ${STORE_NAME}` // names the confirmation
            : route === 'catalogue' // the shop
              ? `Shop · ${STORE_NAME}` // names the shop
              : STORE_NAME // Home
  }, [route])

  /**
   * Notes a plain click on the Cart tab; a click that opens a new tab or window leaves this tab's route alone, so it must not mark.
   * @param event the click on the Cart tab's link
   */
  const markTabOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return // new tab or window: no route change here
    tabClicked.current = true // the next cart entry follows a tab one
  }

  /** Back from the cart: history back when this very history entry was pushed by a tab, otherwise the shop. */
  const goBack = () => {
    const fromTab = (window.history.state as { fromTab?: boolean } | null)?.fromTab === true // the entry's own mark, true also after browser Back or Forward into it
    if (fromTab)
      window.history.back() // the same as the back button
    else window.location.hash = CATALOGUE_HASH // opened by address or reload: there is nothing to go back to
  }

  /** Back from the details page: history back when Checkout pushed this very entry, otherwise to the cart by address. */
  const goBackToCart = () => {
    const fromCart = (window.history.state as { fromCart?: boolean } | null)?.fromCart === true // the entry's own mark
    if (fromCart)
      window.history.back() // the same as the back button
    else window.location.replace(CART_HASH) // opened by address or reload: there is nothing to go back to, and no bounce entry is left
  }

  /** Empty cart's Browse more: back to the Shop entry when the Shop tab opened this cart (so Back does not land on a second copy of Shop), otherwise to Shop in place of the cart's entry. */
  const goToShop = () => {
    browsed.current = true // the buyer asked to browse: focus the page, not the Cart tab
    const fromShop = (window.history.state as { fromShop?: boolean } | null)?.fromShop === true // the entry's own mark: Shop was the screen before the cart
    if (fromShop)
      window.history.back() // the Shop entry itself, with its search, filter and scroll
    else window.location.replace(CATALOGUE_HASH) // no new history entry: Back reaches the screen before the cart
  }

  /**
   * Puts a category pick in the address, replacing the entry so Back leaves Shop instead of stepping through picks.
   * @param next the category picked, or null for All categories
   */
  const selectCategory = (next: string | null) => {
    setShop((current) => ({ ...current, category: next })) // the grid already shows it when the address changes
    window.location.replace(shopHash(next)) // same entry, so reload keeps the filter
  }

  /** Back from the confirmation: always the catalogue, because the cart it came from is gone. */
  const goToCatalogue = () => {
    window.location.hash = CATALOGUE_HASH // the catalogue
  }

  return (
    // the cart provider gets the loaded items, null until they arrive
    <CartProvider items={data.state.status === 'ready' ? data.state.items : null}>
      <OrderFormProvider>
        <div className="bg-bg-app text-text-default min-h-screen">
          <AppHeader
            siteTitle={STORE_NAME}
            variant={route === 'home' ? 'home' : route === 'catalogue' ? 'shop' : 'inner'} // the header grid's three looks
            backHref={route === 'details' ? CART_HASH : CATALOGUE_HASH} // where the < button leads: the details page to the cart, the rest to the catalogue
            onBack={route === 'cart' ? goBack : route === 'details' ? goBackToCart : goToCatalogue} // each screen's own back rule
          />
          <main
            ref={mainRef} // focused when a screen opens
            tabIndex={-1} // focusable by code only
            className={`${route === 'home' ? '' : 'mx-auto max-w-300 px-4 pt-6'} pb-28 outline-none`} // Home lays out its own full-width band
          >
            {/* Home draws its own band and columns. */}
            {route === 'home' && <HomeScreen data={data} />}
            {/* Stays mounted but hidden while another screen shows, so search, category and pictures survive. */}
            <div hidden={route !== 'catalogue'}>
              <Catalogue
                key={shop.key} // a fresh arrival with another category remounts it
                data={data}
                category={route === 'catalogue' ? category : shop.category} // the last Shop category while hidden, so the grid does not re-filter on every screen change
                onSelectCategory={selectCategory} // dropdown and Clear filters
              />
            </div>
            {/* Only while the address names it, so removed notes end when the buyer leaves. */}
            {route === 'cart' && <CartScreen data={data} onBack={goToShop} />}
            {/* The order form's own page: Checkout leads here. */}
            {route === 'details' && <DetailsScreen data={data} />}
            {/* Its < leads to the shop: the cart it came from is gone. */}
            {route === 'order-sent' && <ConfirmationScreen onBack={goToCatalogue} />}
          </main>
          {/* Home and Shop only; the other screens keep their < and their own bottom bars. */}
          {(route === 'home' || route === 'catalogue') && (
            <TabPill
              current={route} // the tab for this screen
              items={data.state.status === 'ready' ? data.state.items : null} // the Cart tab counts once they have loaded
              currency={data.state.status === 'ready' ? data.state.settings.currency : null} // and prices once they have
              shopHref={shopHash(shop.category)} // the Shop tab reopens the last Shop address
              cartLinkRef={cartTabRef} // focused on return from the cart
              onOpenCart={markTabOpen} // marks the cart's history entry
            />
          )}
        </div>
      </OrderFormProvider>
    </CartProvider>
  )
}
