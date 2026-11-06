// The three category icons as inline SVG, so the category mark needs no icon package.

import type { CategoryIconName } from './category-mark.ts' // the icon names

/*! @license MIT (Tabler Icons)
Icons, except the neckerchief, are copied unchanged from Tabler Icons, outline set, release v3.50.0
(https://github.com/tabler/tabler-icons/tree/v3.50.0/icons/outline), under the MIT licence:

  MIT License

  Copyright (c) 2020-2026 Paweł Kuna

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
 */
const paths: Record<CategoryIconName, string[]> = {
  award: [
    // Tabler outline icon, one string per path
    'M6 9a6 6 0 1 0 12 0a6 6 0 1 0 -12 0', // path data
    'M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889', // path data
    'M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889', // path data
  ],
  shirt: [
    // Tabler outline icon, one string per path
    'M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0', // path data
  ],
  neckerchief: [
    // our own icon in Tabler's outline style: the neck loop, the slide ring and the triangle that hangs from it
    'M3 3a9 9 0 0 0 7 7.5', // the left end rising from the ring's side to the neck
    'M21 3a9 9 0 0 1 -7 7.5', // the right end rising from the ring's side to the neck
    'M10 10.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', // the slide ring
    'M3 13h18l-9 8z', // the triangle as wide as the loop, its top edge touching the ring, its point down
  ],
} // path data of each icon, from the Tabler release named above (the neckerchief is ours)

/**
 * Draws one category icon in the current text colour.
 * @param name which icon to draw
 * @param className optional classes, for example a size
 * @return a 24 x 24 outline svg hidden from screen readers
 */
export function CategoryIcon({ name, className }: { name: CategoryIconName; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" // the svg namespace
      viewBox="0 0 24 24" // Tabler draws on a 24 x 24 grid
      fill="none" // outline icons are strokes only
      stroke="currentColor" // takes the surrounding text colour
      strokeWidth="2" // Tabler outline stroke
      strokeLinecap="round" // Tabler outline line ends
      strokeLinejoin="round" // Tabler outline corners
      aria-hidden="true" // decoration; the name says the category
      className={className} // size from the caller
    >
      {/* One path element per path string of the chosen icon. */}
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
