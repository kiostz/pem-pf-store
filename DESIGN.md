# PEM Pathfinder Store — design

The tokens live in `src/styles/index.css`; this file says why they are what they are.

## Product

- **What it is:** an online order form for AY honor patches, for Pathfinder clubs in Malaysia. Orders go by email. There is no payment on the site.
- **Who buys:** anyone. Club leaders, parents and Pathfinders all use it like an ordinary online store. Most arrive knowing which honor they need, on a phone.
- **The job:** find honors, set quantities and send an order in under two minutes, then keep the order number.
- **Feel:** an official store. Clean, trustworthy and plain, like a supplier's catalogue. The patch pictures are the colour; the interface stays quiet.
- **Voice:** plain and polite. Short sentences, verbs first on buttons. The site says "we" for the people who handle orders. Prices read like `RM 4.00`.
- **Brand limits:**
  - The name is always "PEM Pathfinder Store".
  - Words come from the project glossary (honor, not badge or product).
  - The emblem is used on the public site: Home traces its outline (see The welcome band and the emblem trace). The trademark risk is accepted and a takedown would mean removing the trace.
  - English only.

## Direction

- **Name:** Oxblood and stone.
- **Thesis:** an everyday store with a warm, grown-up face. A stone page with white rounded cards, a deep oxblood header and oxblood pill buttons with stone lettering. The patch pictures carry the rest of the colour.
- **Memorable thing:** the oxblood header with the big "PEM Pathfinder Store" title, and the same oxblood pill on every action. On the dark theme the buttons turn rose, so the brand colour stays visible.
- **Reference:** the card and pill structure follows apple.com/shop; the feel is our own. Nothing is copied: no Apple fonts, logos or brand values.

## Palette

Every ratio below is measured from the values in `src/styles/index.css` (WCAG 2 relative luminance), not copied from an earlier draft. "Page" is the stone or black ground, "card" the white or dark surface, "soft" the stepper fill.

| Role                           | Light                                                       | Dark                                                    |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------- |
| page                           | `#F3F0EC` stone                                             | `#000000`                                               |
| card                           | `#FFFFFF`                                                   | `#1C1C1E`                                               |
| soft fill (stepper pill, tab capsule) | `#ECE6E1`                                            | `#2C2C2E`                                               |
| ink (text)                     | `#1D1D1F` (14.8:1 on page, 16.8:1 on card, 13.6:1 on soft)  | `#F5F5F7` (19.3:1 on page, 15.6:1 on card, 12.8:1 on soft) |
| muted                          | `#55555A` (6.5:1 on page, 7.4:1 on card, 6.0:1 on soft)     | `#A1A1A6` (8.2:1 on page, 6.6:1 on card, 5.4:1 on soft) |
| hairline                       | `#D2D2D7` (1.3:1 on page, 1.5:1 on card)                    | `#38383A` (1.8:1 on page, 1.5:1 on card)                |
| oxblood (header, buttons)      | `#4A1520` (13.0:1 on page); hover `#33101A`                 | header `#2A0C12`                                        |
| stone (text on oxblood)        | `#F3F0EC` (13.0:1; 15.0:1 on hover)                         | `#F3F0EC` (15.9:1 on the header)                        |
| rose (dark buttons)            | not used for buttons                                        | `#E8B4BC` (11.7:1 on page, 9.5:1 on card)               |
| button                         | oxblood fill, stone text (13.0:1)                           | rose fill, oxblood text (8.2:1; hover `#F0C4CA`, 9.5:1) |
| Browse the shop pill (Home)    | rose `#E8B4BC` with oxblood text (8.2:1); 8.2:1 against the band | the same; 10.1:1 against the dark band             |
| errors                         | `#B91C1C` (5.7:1 on page, 6.5:1 on card)                    | `#F87171` (7.6:1 on page, 6.2:1 on card)                |
| success (Active switch track)  | `#15803D` (5.0:1 on card, 4.4:1 on page; white thumb 5.0:1 on it) | `#22C55E` (7.5:1 on card, 9.2:1 on page; card-coloured thumb 7.5:1 on it) |
| trash icon                     | `#C62828` (4.5:1 on soft, 5.6:1 on card, 3.06:1 on the Removed note) | `#FF6B6B` (5.0:1 on soft, 6.1:1 on card, 4.1:1 on the note) |
| Unavailable tag                | `#8A4B00` on `#FDF0DC` (6.1:1)                              | `#F5C26B` on `#3D2A0F` (8.3:1)                          |
| Removed note                   | `#F3F0EC` on `#1B1B1D` (15.1:1)                             | `#F5F5F7` on `#3A3A3C` (10.4:1)                         |
| close mark on the failure note | white `#FFFFFF` on a `#C62828` circle, the same in both themes (5.6:1). The circle is 3.06:1 against the light note fill and 2.0:1 against the dark one, so the white x carries it, not the circle | same |
| focus ring                     | `#3B82F6` (3.2:1 on page, 3.7:1 on card, 4.0:1 on oxblood)  | `#8AB4FF` (10.1:1 on page, 8.2:1 on card, 8.7:1 on the header) |
| cart stepper focus ring        | oxblood (12.0:1 on soft, 14.8:1 on card)                    | `#8AB4FF` (6.7:1 on soft, 8.2:1 on card)                |
| emblem trace                   | rose `#E8B4BC` (8.2:1 on the band)                          | the same (10.1:1 on the dark band)                      |

- The Category mark colours stay as ruled (real patch backgrounds).
- Red is kept for errors, the trash icon and the failure note's close circle.
- Tan `#B89A7A` is not used: it is 2.6:1 on white, so never text.
- The focus ring is blue (`#3B82F6`) so it never matches the oxblood it sits on. It measures 2.97:1 on the soft fill, so the cart stepper has its own ring (above).
- The hairline is a quiet edge, not a boundary a reader depends on: it is about 1.5:1, below the 3:1 a control edge would need. Every control that must be found (fields, steppers, buttons) has text or a fill that carries it, and the card edge only tidies the grouping.
- The trash icon beside "removed" in the light Removed note is 3.06:1 on the note fill `#1B1B1D`, held at 3:1 by the test. The red `#C62828` is ruled, so the note fill was darkened from `#1D1D1F` to reach it.
- The two newest category marks (the square is the same in light and dark; only the hairline round it changes):

| Category    | Patch colour       | Icon                                              | Icon colour         | Icon on patch (light and dark) | Patch on card, light / dark |
| ----------- | ------------------ | ------------------------------------------------- | ------------------- | ------------------------------ | --------------------------- |
| Shirt       | khaki `#C3B091`    | Tabler `shirt`                                    | near-black `#171717` | 8.5:1                          | 2.1:1 / 8.1:1                |
| Accessories | slate `#2F4858`    | our own neckerchief (Tabler outline style, 24 px grid, 2 px stroke, round caps and joins; a neck loop whose two ends rise from the sides of a slide ring, with a triangle as wide as the loop hanging from the ring, four paths) | white `#FFFFFF`     | 9.6:1                          | 9.6:1 / 1.8:1                |

- The patch edge against the card is under 3:1 in one theme for each (khaki in light, slate in dark), as the real patch colours are; the hairline and the icon carry the square, and the name beside it names the category. Shirt's tile name is near-black with no halo (8.5:1), Accessories' is white in the plain halo (9.6:1).
- Tile names: near-black `#171717` on the three light tiles (9.1:1 on Household Arts `#F6A949`, 15.9:1 on Nature `#F0F2ED`, 8.5:1 on Shirt `#C3B091`; the tile colours are patch colours), white elsewhere, always over a dark halo (see Components).
- Print keeps the light values on a white page.
- A test (`src/styles/tokens.test.ts`) holds the listed text pairs at 4.5:1 and the listed icon and ring pairs at 3:1, in light, dark and print, plus the close mark, the Browse the shop pill and the trace.
- The three trace colours (`trace`, `trace-bright`, `trace-core`) are read by the trace's canvas code as hex. Keep them opaque hex that the build cannot shorten to a colour name (`#ff0000` would become `red`). The build does shorten `#ffffff` to `#fff`, so the reader accepts the three-digit form too; a value it cannot read leaves the trace as the still outline.

## Type

- For now, the system font stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. No web font is downloaded.
- Public Sans (OFL) is the intended face, added later.
- Big, bold screen titles; plain body text; prices in tabular figures.
- Exact sizes are in Spacing and sizes below.

## Layout

```
Shop, 375 px                        Shop, desktop (1440)
PEM Pathfinder Store  [☀]           PEM Pathfinder Store                          [☀]
Shop                                Shop
( ⌕ Search items           )        ( ⌕ Search items   )  [ All categories v ]
[ All categories v ]
┌──────────┐ ┌──────────┐           ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  ( ◉ )   │ │  ( ◉ )   │           │ ( ◉ )│ │ ( ◉ )│ │ ( ◉ )│ │ ( ◉ )│ │ ( ◉ )│
│Knot Tying│ │Camping I │           │Knot T│ │Camp. │ │First │ │Swim. │ │Nature│
│Outdoor   │ │Recreation│           │RM4.00│ │RM4.00│ │RM4.00│ │RM4.00│ │RM4.00│
│RM 4.00   │ │RM 4.00   │           │ (Add)│ │(−1+) │ │ (Add)│ │ (Add)│ │ (Add)│
│  (Add)   │ │ (− 1 +)  │           └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
└──────────┘ └──────────┘
[ Home ][ Shop ][ Cart ]              tab pill floating at the bottom of Home and Shop
(Home)(Shop)( 3 items · RM 12.00  › ) the Cart tab grows once something is picked
```

Columns: 1 under 348 px, 2 from 348 px, 3 from 640 px, 4 from 768 px, 5 from 1,024 px. The site name sits small above the "Shop" heading; Home's title is big (see Spacing and sizes).
```

Home, the landing page at `#/` (375 px):

```
[  PEM Pathfinder Store  (☀)]   44 px · title · 44 px
┌──────────────────────────────┐
│ Everything your club needs,  │   oxblood band, rounded bottom corners,
│ in one order        ╱╲ trace │   the emblem outline on its right
│ Pick the items, send ...  ╲╱ │
│ (Browse the shop ›)          │   rose pill, the one primary action
└──────────────────────────────┘
Shop by category
[Recreation][Health and S…][Outd…   scrolls sideways, the next tile shows in part
How ordering works
┌──────────────────────────────┐
│ (1) Pick your items          │
│ (2) Send your details        │
│ (3) Get your invoice         │
└──────────────────────────────┘
```

The cart and the details page (375 px): the same pill, other contents.

```
Cart                           Cart, nothing to order      Details
[ Removed note        Undo ]   (the same pill, alone)      [ Send failed note        x ]
( Estimated total · 5 items    ( Browse more  > )          No payment now. We'll contact you ...
  RM 20.00      [Checkout >] )                             ( Send order · RM 24.00 )
```

Content is centred in a 1,200 px column on desktop; the cart, details and Order sent screens use a 768 px column.

## Components

### The header

- An oxblood band in one grid on every screen: a 44 px left slot, the title, a 44 px right slot, so the title never moves. On paper the band drops its fill and takes ink.
- Home shows the big "PEM Pathfinder Store" (18 px under 400 px so it stays on one line, 20 px to 640 px, 28 px from 640 px; balanced over two lines if it must wrap) and the theme button on the right.
- Shop shows a small "PEM Pathfinder Store" over "Shop" and the theme button.
- Inner screens (cart, details, Order sent) show a solid < back button on the left and a small "PEM Pathfinder Store" above the page title, with no theme button. The < is frozen while an order sends.

### The theme button

A 44 px outlined circle in the header of Home and Shop: a sun while the page is light, a moon while it is dark. A tap flips between the two and remembers the pick; the first visit follows the device. It does not print.

### The floating pill

- One shape on every screen that has one: white, 64 px tall, 16 px from the sides, 22 px from the bottom, 420 px at most and centred. Its edge is a soft oxblood-tinted shadow (`--shadow-pill`, drawn by `.pill-edge`) in light, and in dark a 1 px `border-subtle` hairline in its place, because a shadow does not read on black.
- Four contents:
  - Home and Shop: the tabs (Home, Shop, Cart).
  - Cart: "Estimated total · 5 items" over the total on the left, Checkout on the right. With nothing to order, one full-width Browse more.
  - Details: "Send order · RM 24.00" at full width.
  - Order sent: no pill. Save as PDF or print stays in the page.
- The action inside is an oxblood pill 52 px tall, with a small › where it leads on (not on Send order).
- Whatever is stacked above the pill (the Removed note, the failure note, the no-payment line) sits 12 px over it, as wide as the pill. The no-payment line sits on a stone strip so it reads over the form scrolling beneath it.
- No pill prints.

### The tab pill

- Home, Shop and Cart. The current tab sits on the stone capsule (`bg-soft`) in oxblood (rose in dark). With an empty cart the three tabs are equal.
- Once an item is orderable, Home and Shop shrink to 64 px and the Cart tab grows into an oxblood button reading the Item count over the estimated total (the full words "Estimated total" from 640 px), then ›. Its accessible name is "Cart, 5 items, estimated total RM 20.00", and a hidden status line announces the count and total.
- The Shop tab reopens the last Shop address.

### Cards

- White (dark `#1C1C1E`), 16 px radius, and a 1 px `border-subtle` hairline in both themes. No shadow in either theme: the hairline alone gives the edge, so a card looks the same whichever way the theme is set.
- This holds for the Honor card, the cart card, and the cards on Order sent. Home's "How ordering works" list has it too, with hairline dividers between steps in the soft fill.
- The patch picture is the hero of an Honor card; the name wraps rather than truncates; the Category label is a quiet text box (not a control); the price is muted in tabular figures; Add sits at the same height on every card in a row.

### Buttons and steppers

- Buttons are pills, 44 px tall at least, with a press feedback of scale 0.97 over 100 ms and the focus ring outside.
- Add turns into a - 1 + pill on the card after the first tap (134 px wide).
- The cart's stepper pill is 36 px drawn on the soft fill with a 44 px tap area per control. At quantity 1 the minus becomes the trash; on a Sold out line it is the trash at any quantity, so one tap removes it.

### The Removed note and the failure note

- Both are the same dark note (`bg-inverse`), as wide as the pill, stacked 12 px above it.
- The Removed note names the honor and has Undo. It slides up and fades in; it holds 5 s, fades in its last 150 ms, pauses while the pointer or focus is on it, and restarts at 5 s when they leave. With Reduce Motion it fades only.
- The send-failure note shows when sending fails: a white x on a red 32 px circle (44 px tap area) in place of Undo. It stays until the next send or the x, because a buyer has to act on it.

### Category tiles

- A tile is the category's full patch colour, 104 x 88 px, its name bottom-left, in a row that scrolls sideways so the next tile shows in part.
- The name follows the category mark's rule: near-black `#171717` on the three light tiles (Nature, Household Arts, Shirt), white on the rest. White names sit in a dark halo (`text-shadow-halo`), and on Arts and Crafts, where white is only 3.6:1, in a stronger, tighter one (`text-shadow-halo-strong`). Near-black names have no halo.
- `on-patch` (`#FFFFFF`, the same in light and dark) is the white of those names; it is used only over the halo.

### The welcome band and the emblem trace

- Home's band runs the full width under the header with 16 px bottom corners; its text sits in the 1,200 px column. Browse the shop is a rose pill (the same rose in light and dark), the one primary action.
- The emblem trace is decoration. It draws once when Home opens, in under 5 s, then only the outline stays: a rose line, 2 px at 55 % opacity, print hidden.
  - Each piece of line takes its colour from the time since the point passed it: white-hot for a moment, then a rose glow, then the resting outline, drawn with additive blending, so the head glows and cools to rose.
  - A copy of each frame at half size, blurred by 8 px and added on top, makes the hot parts bleed a soft bloom (a CSS filter on the element, not the canvas context's, which older Safari lacks).
  - The head has a white core, a rose disc, a halo and four flickering rays, and it throws about 40 rose sparks a second.
  - The canvases reach 16 px beyond the 174 x 170 box on every side so the head's glow is never cut flat; the box itself does not change.
  - A static SVG holds the one path; it is the resting outline and the geometry the canvases read, and it is hidden only while the canvases play. With Reduce Motion, with no canvas, and after the play it is the whole drawing.
  - The text column stops short of the drawing from 640 px and the drawing sits under the text on a phone, so no letter lies over the line (stone text on the line blended into the band would fall to 3.8:1).
- Why it repaints: two canvases repaint for the 4.8 s because per-piece colour with additive blending and a blur is not something one SVG can do cheaply, and it is one short drawing. The frame loop stops and both canvases clear at 4.8 s, so nothing moves after 5 s and it needs no pause control. With Reduce Motion the loop never starts. It plays again each time Home opens.

## Radius and motion

| Token                 | Value                                   | Use                                                              |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `radius-card`         | 16 px                                   | cards, notes, the band's bottom corners                          |
| `radius-pill`         | full                                    | buttons, fields, the floating pill                               |
| `radius-picture`      | 10 px                                   | the cart row's Patch picture                                     |
| `duration-press`      | 100 ms                                  | press feedback (scale 0.97)                                      |
| `duration-fast`       | 150 ms                                  | menus fading, Reduce Motion fades       |
| `duration-enter`      | 240 ms                                  | the one entrance fade, the Removed note's slide                  |
| `duration-exit`       | 150 ms                                  | things leaving, the Removed note's exit                          |
| `duration-toggle`     | 250 ms                                  | the tab pill's width change                                      |
| `duration-pulse`      | 1,600 ms                                | new: one slow breath of a loading skeleton, opacity 1 to 0.5 and back (a faster pulse reads as nervous; opacity only, off under Reduce Motion) |
| `duration-trace`      | 4,800 ms                                | the emblem trace's whole play, under 5 s                         |
| `delay-loader`        | 300 ms                                  | a spinner or skeleton stays hidden this long, so quick waits flash nothing |
| `ease-out-soft`       | `cubic-bezier(0.22, 1, 0.36, 1)`        | things entering                                                  |
| `ease-in-soft`        | `cubic-bezier(0.4, 0, 1, 1)`            | things leaving                                                   |
| `ease-in-out-soft`    | `cubic-bezier(0.65, 0, 0.35, 1)`        | a move that stays on screen: the tabs changing width             |

- Motion is short and plain. The one entrance is a fade. The Removed note slides up 16 px while it fades in.
- The tab pill's width change is 250 ms (`duration-toggle`, `ease-in-out-soft`). The tabs are flex items that transition `flex-grow` and `flex-basis`, because a grid's `1fr` and `64px` tracks do not interpolate. That animates layout, not only transform and opacity; it is accepted for one 64 px bar. With Reduce Motion the widths jump and the content takes a plain quick fade.
- The emblem trace repaints two canvases for under 5 s (see Components); it is the only animation that is not a transition or a fade.
- Reduce Motion: no width change, no slide, no canvases. The still SVG outline stays.
- The send spinner is hidden for 300 ms, then fades in and turns round once every 0.8 s until the send ends.
- Scrolling: a focused field or the captcha scrolls clear of the floating pill and the line over it (144 px), and 272 px while the failure note shows.

## States per screen

- **Home:** the band and the steps never wait on the data. The tiles show pulsing skeleton tiles while loading (no emblem loader: the trace plays once on the band, as always), then the tiles; the page ends with a quiet, underlined "Admin" link (44 px tall, muted) to the live admin, after How ordering works, in the same tab and left off paper; on a failed load, the load error with Try again; with nothing switched on, "Nothing is in the shop yet. Check back soon." The tab pill shows with the Cart tab plain or grown.
- **Load errors (all four screens):** a 429 says "The shop is busy right now. Try again in a minute."; any other failure says "We couldn't load the shop. Check your connection and try again."; both come with Try again, and the cart is kept.
- **Shop:** skeleton toolbar, count and cards of the cards' own shape (picture, name, label, price, stock line, Add) while loading, pulsing, with nothing for the first 300 ms and "Loading the shop" for a screen reader; the grid fades in once as a whole. Each card shows "Stock: N left" under the price (13 px muted, tabular, thousands separator), Sold out cards included. A Sold out card (stock 0) greys its picture (grayscale, 50% opacity; the text keeps full strength) and shows a soft "Sold out" pill in the 44 px slot where Add stood: it is a span, takes no focus and does nothing. The steppers stop at the lower of 99 and the stock: + goes dead with "N is the most of ...", and a typed number commits as that limit. The count line is polite-live. With no match: "No items match ..." and Clear filters. With nothing switched on: the empty message. On a failed load: the load error and Try again. Cards fall to one column under 348 px, where two would be too narrow for the stepper.
- **Cart:** lines in one card, each with a stepper; an Unavailable line is greyed, tagged and left out of the total, with a trash and a note under the heading saying how many items are no longer available. Removing a line shows the Removed note with Undo. Empty cart: a soft circle, "Your cart is empty" and one full-width Browse more in the pill, which returns to the Shop entry it came from. Loading shows pulsing lines of the same shape after 300 ms; a failed load shows the load error and Try again. A line above today's stock shows "Only N left", or "Sold out" at stock 0, in danger text where "each" stood; + is dead and the minus still works (a Sold out line shows the trash in its place, at any quantity). While any such line remains, a dark note above the pill says "Lower or remove the items marked in red to check out." and Checkout moves focus to the first marked line instead of going on; the buyer's stored cart is never changed. Each marked line also gets a 2 px inset ring in the danger colour (inside its box, so the hairlines do not move; the red is never the only mark, the words say it too). After the Worker refuses an order the buyer lands here and the dark note reads "Your order was not sent. Some items changed while you were ordering. Lower or remove the marked items, then check out again." in place of the one above, until the cart changes; the lines the Worker named show their fresh stock, and an item it says is not for sale shows "Item no longer in the shop". When the refused order's only line was dropped there is no Checkout, so the same dark note stands in the flow under the heading, above the Unavailable banner and line, with Browse more still in the pill; it goes when the cart changes.
- **Details:** the form in a 768 px column with Send order in the pill. While the shop loads (after 300 ms) the fields show as pulsing bars at their real heights: four label-over-44 px rows and the Turnstile widget's 300 by 65 px box. A page that cannot lead to a right order (empty cart, an Unavailable line or a line above stock still in it, a typed address) goes back to the cart. While sending, the heading and fields are inert and Send order shows the spinner. After a failed send the failure note shows above the pill; after a refusal for stock the buyer is sent to the cart instead (see Cart), with the form kept.
- **Order sent:** the whole order for the buyer to keep or print: order number, date, lines, estimated total and the buyer's details. It leaves only by its <. No pill. With no order in this tab: "There is no order to show here." and Browse more.

## Print

- Print uses the light values on a white page whatever the theme; the dark rules are screen only.
- The header and Home's band drop their fills and take ink. The theme button, the floating pill, notes, the trace and the print button do not print.
- Order sent's blocks do not break across pages.

## Replaced rulings

- Cards no longer have "no edge in light": they keep the 1 px hairline in both themes.
- The trace is the canvas heat tracer; the earlier SVG tails and CSS rider are gone, and so are the `duration-trace-build` and `duration-trace-flicker` tokens.
- Tile names are dark on the three light tiles and white with a halo on the others (not an all-white halo).
- The name is "PEM Pathfinder Store" everywhere; no earlier name appears.
- One floating pill on every screen with one, with the failure note's white x on red.
- The theme control is one button (sun or moon), not a dropdown.

## Spacing and sizes

All spacing is on a 4 px scale (Tailwind steps). The gap inside a group is smaller than the gap between groups. Values are taken from the catalogue and cart as built.

| Use                                     | Value                                       | In code                   |
| --------------------------------------- | ------------------------------------------- | ------------------------- |
| Page side gutter                        | 16 px                                       | `px-4`                    |
| Content column (desktop)                | 1,200 px max                                | `max-w-300`               |
| Top of page content                     | 24 px                                       | `pt-6`                    |
| Cart screen column (desktop)            | 768 px max, centred                         | `max-w-3xl`               |
| Between sections (toolbar, count, grid) | 12–24 px                                    | `mt-3` to `mt-6`          |
| Between cards                           | 12 px                                       | `gap-3`                   |
| Inside a card (padding)                 | 8 px under 640 px, 12 px from 640 px        | `p-2 sm:p-3`              |
| Between parts of a card                 | 8 px                                        | `gap-2`                   |
| Header band padding                     | 12 px top and bottom, 16 px sides           | `py-3 px-4`               |
| Header grid                             | 44 px · title · 44 px, 8 px gaps            | `grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]` |
| Theme button                            | 44 px circle, 20 px icon                    | `size-11`, `size-5`       |
| Welcome band                            | 20 px top and bottom, 20 px sides, bottom corners 16 px | `p-5 rounded-b-card` |
| Category tile                           | 104 × 88 px, 10 px padding, 12 px gaps      | `w-26 h-22 p-2.5 gap-3`   |
| Emblem trace                            | about 174 × 170 px at the band's right      | `w-43.5 h-42.5`           |
| Step number circle                      | 32 px                                       | `size-8`                  |
| Patch picture on a card                 | 112 px                                      | `size-28`                 |
| Tap target (buttons, steppers, fields)  | 44 px tall at least                         | `h-11`                    |
| Between neighbouring targets            | 8 px at least                               | `gap-2`                   |
| Card stepper width                      | 134 px                                      |                           |
| Cart stepper pill                       | 36 px drawn, 44 px tap area per control     | `h-9`, `h-11 w-11`        |
| Cart row                                | 80 px                                       | `min-h-20 p-3`            |
| Cart Patch picture                      | 56 px, 10 px corners                        | `size-14 rounded-picture` |
| Removed note                            | held 5 s, fades in its last 150 ms; as wide as the pill | `w-full`  |
| Tab pill                                | 64 px tall, white, 16 px from the sides     | `h-16 inset-x-4`          |
| Tab pill from the bottom                | 22 px (off the 4 px scale on purpose: it floats the pill clear of the phone's home indicator and the edge a thumb rests on) | `bottom-5.5` |
| Tab pill width (desktop)                | 420 px max, centred                         | `max-w-105 mx-auto`       |
| Tab pill tabs                           | 52 px tall in 6 px padding, 4 px gaps; Home and Shop 64 px wide once Cart grows | `h-13 px-1.5 gap-1 basis-16` |
| Bottom clearance under every screen     | 112 px: 26 px above the pill's top edge (64 + 22 = 86 px) | `pb-28`      |
| Stock line on a card                    | 13 px text on a 20 px line, 4 px under the price | new: the same 13 px as the cart's "each" line; the 20 px line height (`leading-5`) is what the skeleton's `h-5` bar copies so nothing shifts |
| Sold out pill                           | the 44 px Add slot, full width, soft fill, muted text (6.0:1) | no new size: it sits where Add stood, so the card keeps its height |
| Checkout blocked note                   | full pill width, `px-4 py-3`, 14 px, 12 px over the pill | the Removed note's dark look; no button inside, so its padding is even |
| Bottom clearance, cart with the blocked note | 272 px: 160 px (`pb-40`) plus 112 px | the screen's 96 px plus 64 px more, not an exact sum: the blocked note is 64 px tall at 375 px (its text wraps to two lines) and the 96 px already has spare room, so 160 px is enough for the Removed note and the blocked note together over the pill; measured at 375 px with both notes showing (13:48:00, Removed note 56 px), the last line ends 91 px above the top note and the total text 42 px above it |
| Details skeleton                        | four rows of a 20 px label bar, 4 px, a 44 px field, 16 px apart, then a 300 by 65 px widget box | the form's real heights (`space-y-4`, `mt-6`) |
| Pill action (Checkout, Send order, Browse more) | 52 px tall in the 64 px pill (6 px round it), 24 px side padding inside Checkout | `h-13 px-6` |
| Pill start padding (cart total)         | 20 px (20 is on the 4 px scale) | `ps-5`            |
| Stack above the pill                    | 12 px between the pill and what sits over it | `gap-3`                  |
| Bottom clearance, cart with the refusal note | 208 px (`pb-52`): no new value, the cart's clearance above | the refusal note is 84 px tall at 375 px (three lines of 14 px text in `py-3`), so it plus the 12 px gap and the pill (64 + 22 px) is 182 px; measured at 375 px with the real 409, the last line of a short cart ends 26 px above the note's top edge when scrolled to the end, the same 26 px as the 112 px row, so the note never covers a line |
| Bottom clearance, cart and details      | 208 px: the screen's 96 px plus 112 px, clearing the note (about 52 px), the 12 px gap and the pill (64 + 22 px); on the details page while the failure note shows, 352 px (240 + 112) so the note never covers a line of the form | `pb-24`, `pb-60` |
| Home title                              | 18 px under 400 px, 20 px to 640 px, 28 px from 640 px | `text-lg min-[400px]:text-xl sm:text-title` |
| Card radius                             | 16 px                                       | `rounded-card`            |
| Buttons, fields, tab pill               | pill                                        | `rounded-pill`            |
| Screen title                            | 20 px under 640 px, 28 px from 640 px, bold | `text-xl sm:text-title`   |

- Cart, order form and confirmation use the same values: a 16 px gutter, 12 px between cards or lines, 24 px between sections, 44 px targets.
- The cart column is 768 px, not 1,200: a line is a picture, a name and a stepper, and across 1,200 px they sit about 900 px apart. The order form and confirmation keep it.
- The cart stepper pill is 36 px because it reads lighter than 44 px on an 80 px row; each control keeps a 44 px tap area (the target rule), drawn round the control so the focus ring sits outside the soft fill.
- The cart Patch picture is 56 px with 10 px corners: two text lines sit beside it, and the row comes to 80 px.
- The Removed note holds 5 s (Customer.io's snackbar timing), pauses while the pointer or focus is on it, and restarts at 5 s when they leave.
- A new value needs a reason written here first.

## Admin Items screen

The admin page (`admin.html`) reuses every token above; it adds no colour, radius or duration. Values it uses, with the reason for each one that is new:

| Use                         | Value                                   | Reason                                                                 |
| --------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Column                      | 768 px max, 16 px gutter                | the cart's column: a row is a name and two controls                    |
| Row                         | card, `p-3`, 12 px between rows         | the cart's values                                                      |
| Row layout                  | two lines under 768 px, one from 768 px | the status control and stepper (about 290 px) do not fit beside a name at 375 px |
| Row text                    | the name (a 44 px underlined button that opens the Item sheet), then "Category · price · changed 3 Nov" in 14 px muted | one line of facts: no count anywhere, and the year appears only outside the current one |
| Toolbar                     | sticky; Search and Add item, then Category and Sort (5:6 widths), 44 px each, 8 px apart; one row from 640 px | Sort and Category read "Recently changed" and "All categories" without wrapping at 375 px (`truncate`) |
| Add item                    | the quiet soft button (soft fill, oxblood text) | Save (n changes) stays the one primary action |
| Item sheet                  | a native `<dialog>`: a bottom sheet at 375 px (16 px corners on top, 16 px padding, 90% of the height at most), a 480 px card (`max-w-120`) from 640 px; Done or Add item is the one oxblood action, Delete item the quiet red one | modal focus trap, Escape and focus return come from `showModal()`; entry is the note's slide-up, or a fade under Reduce Motion |
| Delete dialog               | the same sheet shape; Delete item in the danger red with the page colour as lettering (5.7:1 light, 7.6:1 dark), Keep item soft, focus on Keep item | white on the dark theme's light red would be 2.8:1 |
| Load more                   | a soft 44 px button under the last row; "Loading…" dims it; failure line with Try again | the Load more button sits above the Save pill's clearance, not inside the pill |
| Conflict flag               | the amber pair (Unavailable tag colours) with "This item has been updated." in bold, then "Latest: …" | the one existing amber pair, 6.1:1 and 8.3:1; the admin's own edit stays pending beneath it, and a save whose answer differs from a shown value raises the same flag |
| Pending row edge            | 4 px inset oxblood on the start side (`shadow-[inset_4px_0_0_var(--color-accent)]`) | new: marks a pending row without changing its size; the "Changed" label says it too, so it is never colour alone |
| Status control              | one switch, 44 px target: 44 x 24 px track, green (`success`) when Active, grey (`text-muted`, 7.4:1 on card) when Hidden, the word beside it | green is the one new token: the track must hold 3:1 against the card as a non-text control, and green says shown where grey says off; the word means it is never colour alone |
| Stock stepper number        | 56 px wide (`w-14`), controls 44 px     | new: room for four digits (9,999) at 18 px; the cart's number is 44 px for two |
| Notes above the pill        | the Removed note's dark note, 12 px over the pill | the same note shape and slide-up                                |
| Bottom clearance            | 208 px (`pb-52`)                        | the cart's clearance: a note (about 52 px), the 12 px gap and the pill |
| Skeleton row                | 144 px under 768 px, 90 px from 768 px  | the real row's two heights, measured at 375 px and 1280 px (the details line grew); shown after `delay-loader` |

## Admin Orders and Settings

The admin tabs reuse every token above; they add no colour, radius or duration.

| Use                  | Value                                                                 | Reason                                                                 |
| -------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tab bar              | a nav of three 44 px links under the header, `bg-app` with a hairline below; the open tab on the `bg-soft` capsule in oxblood and bold, the others muted | the Tab pill's current-tab look; links, not ARIA tabs, since each tab is an address |
| Pending dot          | an 8 px oxblood dot after "Items" plus the words "changes not saved" for screen readers | the pending-changes exception to the oxblood rule; the Items screen stays mounted and hidden on other tabs |
| Order row            | a card with a full-width disclosure button (`aria-expanded`): number in bold, the step tag, then date and club, buyer, "3 items · RM 12.00" in 14 px | the row closed says everything a list scan needs; no count of orders anywhere |
| Step tag             | icon plus word: New soft fill with oxblood text (a clock); Paid soft fill with ink (a tick); Handed out the dark note's pair `bg-inverse` and `on-inverse` (a parcel); Cancelled a danger outline and danger text on the card (a cross) | status is never colour alone; every pair reuses an existing token and holds 4.5:1 |
| Step select          | the site's select, 44 px, labelled "Step"; New, Paid, Handed out only | Cancelled is final and has its own dialog |
| Cancel order         | a quiet underlined danger-text button at 44 px, away from the primary spot | the one destructive action on an open row |
| Cancel dialog        | the Delete dialog's sheet; Cancel order in the danger red with page-colour lettering, Keep order soft and focused; the restock box is a 20 px native checkbox in a 44 px row | the same shape and contrast reasons as the Delete dialog |
| Order email switch   | the Active switch's track (44 x 24 px, green On, grey Off) in a card, with "On" or "Off" beside it | same control and token as the status switch; the word keeps it from being colour alone |
| Outcome lines        | a 14 px status line under the row header ("Step saved.", the conflict, the failure with Try again) and under the switch ("Saved.") | polite live regions, mounted before they speak |
| Skeleton row         | 126 px (`h-31.5`), six rows, after `delay-loader`                     | a closed row's measured height (126 px at 375 px and at desktop width) |

## Principles

- Oxblood marks every action and the header; nothing else uses it, except the rose Browse the shop pill on Home's band, and, on the admin Items screen, the edge and "Changed" label of a row with changes waiting to be saved, and the dot on the Items tab link while any wait (they tie to the oxblood Save button). Dark mode swaps the buttons to rose.
- The patch is the hero of every card. Text stays small and grey under it.
- Quiet chrome: no gradients and no decoration except Home's emblem trace. The space between things does the separating.
- The theme button sits in the header on Home and Shop only.
- Cards have the 1 px hairline and no shadow; only the floating pill casts one, and only in light.
- One way back on inner screens: the < button in the header. Other buttons say "Browse more" when they lead to the catalogue.

## Fixed choices

- Honors show as a card grid, with Add turning into a stepper after the first tap, not as rows with always-shown steppers.
- Unchanged: the A–Z order, the Category label on each card, the Category filter dropdown, the Category mark colours and the confirmation wording.
