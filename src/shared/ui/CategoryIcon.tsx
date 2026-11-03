// The twelve category icons as inline SVG, so the category mark needs no icon package.

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
  'heart-handshake': [
    // Tabler outline icon, one string per path
    'M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572', // path data
    'M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25', // path data
    'M12.5 15.5l2 2', // path data
    'M15 13l2 2', // path data
  ],
  palette: [
    // Tabler outline icon, one string per path
    'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25', // path data
    'M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', // path data
    'M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', // path data
    'M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', // path data
  ],
  microscope: [
    // Tabler outline icon, one string per path
    'M5 21h14', // path data
    'M6 18h2', // path data
    'M7 18v3', // path data
    'M9 11l3 3l6 -6l-3 -3l-6 6', // path data
    'M10.5 12.5l-1.5 1.5', // path data
    'M17 3l3 3', // path data
    'M12 21a6 6 0 0 0 3.715 -10.712', // path data
  ],
  'tools-kitchen-2': [
    // Tabler outline icon, one string per path
    'M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12m0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3', // path data
  ],
  leaf: [
    // Tabler outline icon, one string per path
    'M5 21c.5 -4.5 2.5 -8 7 -10', // path data
    'M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3l.014 0', // path data
  ],
  'plant-2': [
    // Tabler outline icon, one string per path
    'M2 9a10 10 0 1 0 20 0', // path data
    'M12 19a10 10 0 0 1 10 -10', // path data
    'M2 9a10 10 0 0 1 10 10', // path data
    'M12 4a9.7 9.7 0 0 1 2.99 7.5', // path data
    'M9.01 11.5a9.7 9.7 0 0 1 2.99 -7.5', // path data
  ],
  world: [
    // Tabler outline icon, one string per path
    'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', // path data
    'M3.6 9h16.8', // path data
    'M3.6 15h16.8', // path data
    'M11.5 3a17 17 0 0 0 0 18', // path data
    'M12.5 3a17 17 0 0 1 0 18', // path data
  ],
  tent: [
    // Tabler outline icon, one string per path
    'M11 14l4 6h6l-9 -16l-9 16h6l4 -6', // path data
  ],
  tool: [
    // Tabler outline icon, one string per path
    'M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5', // path data
  ],
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
