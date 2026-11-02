// The words a screen reader hears while a skeleton shows, so a buyer who cannot see the grey bars still learns the shop is loading; the region is in the page before it speaks, because NVDA and JAWS often skip a live region that arrives with its text.

/**
 * Draws the hidden loading line; the skeleton's bars stay aria-hidden beside it.
 * @param loading true while the skeleton shows; the text arrives then, in a region that was already mounted
 * @return a polite status region that only a screen reader sees
 */
export function LoadingStatus({ loading }: { loading: boolean }) {
  return (
    // sr-only is positioned out of the flow, so it takes no room in a grid or a row of tiles.
    <p role="status" className="sr-only">
      {loading ? 'Loading the shop' : ''}
    </p>
  )
}
