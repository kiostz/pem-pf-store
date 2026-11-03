// Test setup run before every test file: jest-dom matchers and RTL cleanup between tests.

// Adds matchers such as toBeInTheDocument to Vitest's expect.
import '@testing-library/jest-dom/vitest'
// Unmounts rendered components after each test.
import { cleanup } from '@testing-library/react'
// Vitest's per-test hook.
import { afterEach } from 'vitest'

// jsdom does not know the club select's selectedcontent element (Chrome and Safari do), so React would warn about an unknown tag; this makes jsdom treat it as a plain element.
if (typeof window !== 'undefined') {
  const createElement = document.createElement.bind(document) // the real factory
  /**
   * Makes an element like jsdom's createElement, except that selectedcontent reports itself as a plain HTMLElement.
   * @param tag the tag name
   * @param options the element options, passed on unchanged
   * @return the element
   */
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    const element = createElement(tag, options) // the element jsdom makes
    if (tag === 'selectedcontent')
      Object.defineProperty(element, Symbol.toStringTag, {
        value: 'HTMLElement', // not "HTMLUnknownElement", which React warns about
      }) // only this tag, so no other warning is hidden
    return element // handed back to React
  }) as typeof document.createElement
}

// jsdom has no matchMedia, and the theme hook asks for it on every screen; this default says the system is light. A test that needs another answer replaces it.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false, // a light system
    media: query, // the asked query
    addEventListener: () => undefined, // nothing ever changes
    removeEventListener: () => undefined, // nothing to remove
  })) as unknown as typeof window.matchMedia
}

// jsdom does not implement the modal methods of <dialog>; this gives it showModal and close that set the `open` attribute and fire `close`, enough for the sheets' tests (focus trapping and Escape are the browser's job, checked in the browser).
if (
  typeof window !== 'undefined' &&
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '') // shown
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return // already closed
    this.removeAttribute('open') // hidden
    this.dispatchEvent(new Event('close')) // as a browser does
  }
}

// Remove anything a test rendered so tests do not leak into each other.
afterEach(() => {
  cleanup() // unmount
  if (typeof window !== 'undefined') window.localStorage.clear() // script tests run without a window; the cart is kept there, so one test's cart must not reach the next
})
