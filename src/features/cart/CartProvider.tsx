// The cart state, shared by the row steppers and the cart bar, so one edit shows everywhere; kept in localStorage across reloads. Unavailable ids stay until Checkout takes them out.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react' // context and state
import type { Item } from '@/shared/data/types.ts' // the shape of an item
import { resolveCart, setQuantity as withQuantity, type CartQuantities } from './cart.ts' // the quantity rules
import { readCart, writeCart } from './cart-storage.ts' // the stored cart
import { CartContext } from './use-cart.ts' // the context this provider fills

/**
 * Holds the cart for everything below it, starts from storage and saves every change.
 * @param items the loaded items, or null while loading or after a failed load (nothing can be taken out then)
 * @param children the screens that read or edit the cart
 * @return the provider element
 */
export function CartProvider({ items, children }: { items: Item[] | null; children: ReactNode }) { // the items decide what is unavailable
  const [initial] = useState(readCart) // read once, at start
  const [quantities, setQuantities] = useState<CartQuantities>(initial) // the cart
  // Save each change; the first run is the start, which changes nothing, so a stored value stays untouched until the buyer edits; runs on every cart change.
  useEffect(() => {
    if (quantities === initial) return // nothing changed yet
    writeCart(quantities) // write at once
  }, [quantities, initial]) // rerun when the cart changes

  /**
   * Removes every id the shop no longer lists from the cart in one write; does nothing before items load or when all ids are orderable.
   */
  const takeOutUnavailable = useCallback(() => {
    if (items === null) return // the data is unknown: nothing can be judged unavailable
    setQuantities((current) => {
      const { unavailable } = resolveCart(current, items) // what cannot be ordered
      if (unavailable.length === 0) return current // same object: no re-render, no write
      const next = { ...current } // a copy
      for (const { honorId } of unavailable) delete next[honorId] // out of the cart
      return next // saved by the effect above
    })
  }, [items]) // the items decide what is unavailable

  /**
   * Takes a sent order's lines out of the cart, so only what the buyer added or raised while it was sending stays.
   * @param orderLines each sent honor and the quantity the order listed
   */
  const removeOrderLines = useCallback(
    (orderLines: Array<{ itemId: string; quantity: number }>) =>
      setQuantities((current) =>
        orderLines.reduce(
          (next, { itemId, quantity }) => withQuantity(next, itemId, (next[itemId] ?? 0) - quantity), // what is left of this item; 0 or less removes it
          current, // the cart as it is now, edits made during the send included
        ),
      ), // saved by the effect above
    [], // setQuantities never changes
  )
  const quantityOf = useCallback((honorId: string) => quantities[honorId] ?? 0, [quantities]) // 0 for absent
  const setQuantity = useCallback(
    (honorId: string, quantity: number) => setQuantities((current) => withQuantity(current, honorId, quantity)), // clamp and store
    [], // setQuantities never changes
  ) // one stable setter
  // the object every reader gets
  const value = useMemo(
    () => ({
      quantities,
      quantityOf,
      setQuantity,
      removeOrderLines,
      takeOutUnavailable,
    }), // the cart and its take-out
    [quantities, quantityOf, setQuantity, removeOrderLines, takeOutUnavailable], // new only when one changes
  ) // stable between renders
  return <CartContext.Provider value={value}>{children}</CartContext.Provider> // everything below reads the cart
}
