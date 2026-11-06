# PEM Pathfinder Store

Honors store for Pathfinder clubs. Static site (React, Vite, TypeScript, Tailwind) hosted on GitHub Pages at https://kiostz.github.io/pem-pf-store/.

## Run locally

Needs Node 24 (see `.nvmrc`).

    npm ci
    npm run dev

Open the address Vite prints. For the production build: `npm run build && npm run preview`, then open http://localhost:4173/pem-pf-store/.

## Where the shop gets its data

The shop reads its items, clubs and settings from the API Worker's `/shop`, one request per load, with a 30 second limit. `VITE_API_URL` holds the Worker's address: the live Worker in `.env`, and `/api` in `.env.development`. `npm run dev` proxies `/api` to the local API Worker on http://localhost:8787, so start that first (`npm run dev` in `workers/`, see "Workers"); with it stopped the shop shows "We couldn't load the shop." `npm run preview` serves the production build, which asks the live Worker, and the Worker allows only the live site's address, so the shop can't load from `localhost` there.

### Stock on screen

Each card shows "Stock: N left"; at 0 it shows Sold out in place of Add, and the steppers stop at the stock. A cart line above today's stock, or Sold out, is marked in red and blocks Checkout until the buyer lowers or removes it (their saved cart is never changed for them). Home ends with an "Admin" link to the live Admin Worker. While the shop loads, Shop, Cart and Details show grey skeletons after 300 ms. Orders go through the API Worker (see "Endpoints"), so a sent order lowers stock by itself.

### The first push to the live site (the owner, once)

Work after the last push is committed on `main` and not yet pushed; the user pushes, never a script. Run the deploy checklist first, then in this order:

1. Connect `pictures.stardew.win` to the R2 bucket and check a picture opens (steps 1 and 2 of "Switch pictures to R2").
2. The GitHub deploy token needs R2 access before the first push, because the Admin Worker deploys with the R2 binding. If "Deploy Admin Worker" fails on it, add that one permission and run the job again.
3. Push the API Worker's order lookup by request id (`0caa8c3`) by its id: `git push origin 0caa8c3:main`. It carries all the work before it too (pictures from R2, admin orders with the nightly cron, clubs and settings). Wait for Pages, the API Worker and the Admin Worker to pass.
4. Right after that Pages deploy, run the picture-key rewrite (steps 4 to 6 of "Switch pictures to R2"). Under Triggers, the API Worker should now show the `0 19 * * *` cron. Then push the shop's lookup before a resend (`47c8373`): `git push origin 47c8373:main`, and wait for Pages. The lookup route it calls is already live from step 3.
5. Rename the database to `items`, in this order. Pick a quiet hour, not within 30 minutes of 19:00 UTC. In `workers/`, run `npx wrangler d1 time-travel info pem-pathfinder-store` and keep the bookmark. Count the rows with `npx wrangler d1 execute pem-pathfinder-store --remote --config api/wrangler.jsonc --command "SELECT (SELECT count(*) FROM honors) h, (SELECT count(*) FROM orders) o, (SELECT count(*) FROM order_lines) l, (SELECT count(*) FROM orders WHERE buyer_name IS NULL OR buyer_email IS NULL OR buyer_phone IS NULL) nb"` and note them; `nb` must be 0 (see the `0004` paragraph below). Run `npm run db:migrate:remote`; if it errors, nothing changed, so do not push, and report. Then push the remaining commits at once and wait for Deploy API Worker, Deploy Admin Worker and Pages. Between the migration and the deploys the live shop shows "We couldn't load the shop." for a short while, and no order can be saved.
6. Check the live shop loads, the order counts match the counts taken before, and the admin Orders tab shows buyers.
7. If a deploy fails, never restore for a single failure: if only Pages or only one Worker failed, open the run in the Actions tab and press "Re-run failed jobs", because the Worker that did deploy already saves orders on `items`, and a restore would delete them and break it. Restore only when both Deploy API Worker and Deploy Admin Worker failed (both old Workers still run) and no order has arrived since the migration: `npx wrangler d1 time-travel restore pem-pathfinder-store --bookmark=<the bookmark>`.

Until step 5 has run on the live database, `npm run db:export:remote` fails there (it reads `--table items`, which the live database does not have yet). To refill a local database before that, export with the old table name `honors`.

## Order form settings

The order form reads two keys from the committed `.env` files, which are public by design:

- `VITE_TURNSTILE_SITEKEY`: `.env` holds the live widget's sitekey; `.env.development` holds Cloudflare's published always-passing test sitekey, so the widget works on `localhost`.
- `VITE_API_URL`: where `POST /orders` goes, the same address the shop reads from.

To try the whole order flow locally, start the API Worker (`npm run dev` in `workers/`, with `api/.dev.vars` copied from the example) and the shop (`npm run dev`). Send order then goes through the Vite proxy to the local Worker, which checks the captcha with Cloudflare's test secret, saves the order in the local D1, lowers stock and writes the order email to a file whose path it prints. Use made-up buyer details. For a failed-captcha check, put Cloudflare's always-fail test secret `2x0000000000000000000000000000000AA` in `api/.dev.vars` and restart the Worker.

## Pictures

Pictures live in the R2 bucket `pem-pathfinder-store-pictures` under `items/<id>.webp`. The database column `image` holds that key, never a full address. Buyers load each picture from the bucket's custom domain, `https://pictures.stardew.win/`, which the shop builds from `VITE_PICTURE_URL` in `.env`. The shop shows the Category mark for an `image` that is not an `items/<id>.webp` or `.png` key.

Locally, `.env.development` sets `VITE_PICTURE_URL=/pictures`, and Vite sends `/pictures` to the local Admin Worker (`npm run dev:admin` in `workers/`, port 8788), which serves the local R2 in `workers/api/.wrangler/state`. With `dev:admin` stopped, the local shop shows Category marks. A fresh clone has an empty local R2, so its shop shows Category marks until a picture is uploaded locally.

### Switch pictures to R2 (the owner, once)

1. In the Cloudflare dashboard open R2, the bucket `pem-pathfinder-store-pictures`, Settings, Custom Domains, and add `pictures.stardew.win`. Wait until its status is Active.
2. Check `https://pictures.stardew.win/items/knot-tying.webp` opens in a browser.
3. Commit and push. The push deploys the Pages site, the API Worker and the Admin Worker, which gets its R2 binding. Then check the "Deploy Admin Worker" run; if it names a missing R2 permission on the CI token, add only that one.
4. Right after the push finishes, in `workers/` run the rewrite on the live database:
   `npx wrangler d1 execute pem-pathfinder-store --remote --config api/wrangler.jsonc --command "UPDATE honors SET image = 'items/' || substr(image, 9) WHERE image LIKE 'patches/%'"`.
   It is safe to run twice, and it leaves `modified_at` alone. Until it runs, the shop shows Category marks.
5. Check the count: `npx wrangler d1 execute pem-pathfinder-store --remote --config api/wrangler.jsonc --command "SELECT count(*) AS n FROM honors WHERE image LIKE 'items/%'"` answers 401, and the same query for `'patches/%'` answers 0.
6. Open the live shop and check the pictures load from `pictures.stardew.win` (browser network list).
7. Once the live shop shows the pictures, the move is done. `public/patches/` is already gone from the repo.

## Test

    npm run lint
    npm run typecheck
    npm test

## Deploy

Deploy by pushing to `main`. The workflow `.github/workflows/deploy.yml` runs lint, typecheck and tests, then builds, in a build job; a separate deploy job publishes to Pages. If any step fails, nothing is published and the old site stays up. A deploy already running is never cancelled; a newer push waits for it. It can also be started by hand from the Actions tab.

One-time setup, done by the repository owner: in GitHub open Settings, then Pages, and set Source to GitHub Actions.

## Workers (API and database)

The shop's backend lives in `workers/`, its own npm project (Node 24). Root `npm ci`, typecheck and tests never install or run it; root lint does lint its TypeScript, so run root `npm run lint` after a Worker change. Nothing reaches Cloudflare from these commands: they use a local D1 database kept in `workers/api/.wrangler/`. Never run `wrangler login`, `d1 create`, `--remote` or `deploy` for a local check.

    cd workers
    npm ci
    export WRANGLER_SEND_METRICS=false
    npm run db:migrate:local
    npm run dev

Before `npm run dev`, copy `api/.dev.vars.example` to `api/.dev.vars` (git-ignored): it holds Cloudflare's published Turnstile test secret, a made-up club inbox and `SHOP_ORIGIN=http://localhost:5173`, so the local Worker accepts orders from the dev server. Run `npm run db:migrate:local` again after pulling: migration `0002` adds `orders.request_id`, and `0003` gives every honor `created_at` and `modified_at` (all existing rows get `2026-11-01T00:00:00.000Z`), makes names unique ignoring case, and adds five more indexes, which the admin list reads in order (the unique name index is the sixth). `npm run dev` serves the API Worker at http://localhost:8787. `api/wrangler.jsonc` holds the live database's `database_id` (not a secret); local runs ignore it. Migrations are in `workers/migrations/`; an applied migration is never edited, a change is a new file.

    npm test
    npm run typecheck

Tests run inside workerd with the migrations applied. After changing `api/wrangler.jsonc`, run `npm run types` and commit `api/worker-configuration.d.ts`.

### Fill a fresh local database

A new local D1 starts empty. To fill it with the live shop's items, clubs and settings, run these from `workers/`. The first one reads the real database with your wrangler login, so only the owner runs it:

    npm run db:migrate:local
    npm run db:export:remote
    npm run db:fill:local

`db:export:remote` writes `api/.wrangler/fill.sql` (git-ignored; the script creates the folder if it is missing). It names three tables only, `items`, `clubs` and `settings`, so no order or buyer data is exported. The export briefly blocks other requests to the database, so run it when the shop is quiet. `db:fill:local` runs that file on the local database. The export carries `items/` keys, so the local shop shows pictures once the local R2 holds them. Run it on a fresh database only, never on one that already has rows: it fails on the first duplicate. To start over, delete `api/.wrangler/state` and run `db:migrate:local` again. A `fill.sql` exported before migration `0004` (it says `INSERT INTO honors`) only fills a database that has not run `0004` yet; export again for a migrated one.

Migration `0004_items_and_orders_rebuild.sql` renames `honors` to `items` and `order_lines.honor_id` to `item_id`, and drops `orders.personal_data_removed_at` by rebuilding `orders` and `order_lines` together. It makes the buyer name, email and phone `NOT NULL`: if any order has one empty, `0004` fails and rolls back with nothing changed. Before running it on the live database, check for one with `SELECT count(*) FROM orders WHERE buyer_name IS NULL OR buyer_email IS NULL OR buyer_phone IS NULL`, and take a Time Travel bookmark first.

### Endpoints

The API Worker answers JSON with `Cache-Control: no-store`. The four `GET` reads:

- `/items`: active items by name (ignoring case, equal names by id), as `{ id, name, category, priceCents, stock, image }` (RM 4.00 is `400`). Hidden items never appear.
- `/clubs`: the clubs in their set order, as `{ name, area, language, location, churchName }`.
- `/settings`: `{ currency }` only.
- `/shop`: `{ items, clubs, settings }` in one D1 batch, the same three lists as above, so a shop load is one request; a missing settings row answers 500 `server`.

- `GET /orders/status/<requestId>`: tells a buyer whose answer was lost whether an order was saved under that request id. The `Origin` must be exactly `SHOP_ORIGIN` (403 `forbidden-origin`); the id must be a UUID in any case (400 `invalid`); an extra or empty segment or a trailing slash is 404 `not-found`; any other method is 405 with `Allow: GET`. Answers 200 `{ "found": false }`, or `{ "found": true, "order": { number, createdAt, currency, totalCents, club, lines } }`, never a buyer's name, email or phone. It needs no captcha, writes nothing, and the Worker's own code logs a fixed route name, never the request id; but Cloudflare's request logs (`observability.enabled` in `api/wrangler.jsonc`) keep each URL, the lookup id included, readable only in the Cloudflare account. A shop that kept a request id can call it before resending under that id. Under `npm run dev` the shop's `/api` proxy is same-origin, so the browser sends no `Origin` and the lookup answers 403; to see a lookup locally, set `VITE_API_URL` to `http://localhost:8787` and start the API Worker with `SHOP_ORIGIN` set to the shop's local address.
- `POST /orders` (and `OPTIONS /orders`, the browser's preflight, 204): takes an order and answers 201 with the saved order (`number`, `createdAt`, `currency`, `totalCents`, `club` (the stored club text, "Other: …" when typed), `lines` with the saved names and prices, no buyer fields) plus `kept`: `"this-send"` here, and `"earlier-send"` on a 200 repeat. Body: `requestId` (a UUID the shop keeps for a retry), `turnstileToken`, `name`, `email`, `phone`, `club` (`{ name, typed }`) and `lines` (`{ itemId, quantity }`, 1 to 500, quantity 1 to 99); the body is at most 64 KB; a line that says `honorId` (an old open tab) is a 400 `invalid` with nothing written. Order of checks: `Origin` must be exactly `SHOP_ORIGIN` (403 `forbidden-origin`), body (400 `invalid`, no field named), Turnstile (403 `captcha`, 503 `captcha-unavailable`), a repeated `requestId` (200 with the first send's saved order and `kept: "earlier-send"`, whatever the new body says; no second order, stock drop or email), stock (409 `{ error: 'stock', lines: [{ itemId, stock }] }` listing every line that cannot be filled, `stock: null` for a Hidden or unknown item, nothing written). The save is one guarded D1 batch: the order, its lines (names and prices read from D1, not the request) and the lowered stock commit together or not at all. The order number is `PF-YYYYMMDD-XXXX` with the Malaysia date. After the save, when Settings has the order email On, the Worker sends the order email through the `ORDER_EMAIL` binding from `orders@stardew.win` to the secret `ORDER_EMAIL_TO`, reply-to the buyer; a failed send is logged (order number and error name only) and the order stays saved. Locally `wrangler dev` writes the email to a file and prints its path. Secrets (never in the repo): `TURNSTILE_SECRET` and `ORDER_EMAIL_TO`, set by the owner with `wrangler secret put`; vars `ORDER_EMAIL_FROM` and `ADMIN_URL` are in `api/wrangler.jsonc`. Logs never hold a buyer's name, email, phone or club.

Old order removal: every day at 19:00 UTC (03:00 in Malaysia) the API Worker's `scheduled` handler (cron `0 19 * * *`, `triggers.crons` in `api/wrangler.jsonc`) deletes every order placed more than 12 months before the run, with its order lines (the foreign key cascades). Every step goes alike; items, clubs and settings are never touched and nothing is restocked. The log holds one line, `old orders deleted <count>`, or `old order removal failed <error name>`, and then the run itself fails with a fixed error; the next night tries again. Check the API Worker's cron history in the Cloudflare dashboard and its log for that line: a red run means orders older than 12 months are still held. To run it locally, start the API Worker with the test trigger and call it (it deletes from your local D1, so seed made-up orders first):

    npx wrangler dev --config api/wrangler.jsonc --test-scheduled
    curl "localhost:8787/__scheduled?cron=0+19+*+*+*"

The link on the order email's last line is `ADMIN_URL` plus `/#/orders/<number>`; for local runs put `ADMIN_URL=http://localhost:8788` in `api/.dev.vars` (see `api/.dev.vars.example`).

Paths match exactly, so `/items/` is 404. Errors are a short code only: 404 `not-found`, 405 `method-not-allowed` (with `Allow: GET`, or `Allow: POST, OPTIONS` on `/orders`), 429 `rate-limited` (with `Retry-After: 60`), 500 `server`. CORS: `Access-Control-Allow-Origin` is sent only when `Origin` is exactly `https://kiostz.github.io` (the `SHOP_ORIGIN` var); other callers still get the body. A rate limit of 60 requests per 60 seconds per client IP (the `RATE_LIMITER` binding in `api/wrangler.jsonc`) answers 429 past it; `wrangler dev` enforces it locally too. Cloudflare's docs imply the free plan includes this binding; confirm it at the first deploy.

### Admin Worker (local)

`workers/admin/` is the Admin Worker: the admin page (four tabs: Items, Orders, Clubs and Settings) and the admin API behind Cloudflare Access. Every path answers 403 unless Access signed in an admin whose email is in `ADMIN_EMAILS`. Locally `wrangler dev` simulates Access (`access.dev` in `admin/wrangler.jsonc`), reading `workers/admin/.dev.vars` (git-ignored). Create it once:

    ACCESS_AUD=local-dev
    ADMIN_EMAILS=admin@example.test, second@example.test

Then, with the API Worker's database migrated and filled, from `workers/`:

    npm run dev:admin

`dev:admin` first runs the root `build:admin` (the Vite build of `admin.html` and `src/admin-main.tsx` into `admin/ui-dist/`), so a fresh clone serves the real page; `deploy:admin` does the same. It serves http://localhost:8788 (a tab bar with Items, Orders, Clubs and Settings, at `#/items`, `#/orders` and `#/orders/<number>`, `#/clubs`, `#/settings`) on the same local D1 as `npm run dev`. The admin API: `GET /api/items?sort=changed|newest|name&q=&category=&cursor=` (pages of 50 with `nextCursor`, no total; 400 `invalid` for anything else), `GET /api/meta` (currency, default price, the 11 categories), `POST /api/items/changes` (guarded save of name, category, price, status and stock; 409 `conflict` with `deletedIds`, or `name-taken`), `POST /api/items` (Add: Hidden, stock 0, `Club`) and `POST /api/items/delete` (Club-added items only). Orders and settings: `GET /api/orders?step=new|paid|handed_out|cancelled&cursor=` (pages of 50, newest first, each order with its `buyer` (`name`, `email`, `phone`), its lines and `inShop`; `?number=PF-YYYYMMDD-XXXX` looks one up and cannot be combined with `step` or `cursor`; 400 `invalid` for anything else), `POST /api/orders/step` (`{ number, from, to, restock }`: a guarded step change among New, Paid and Handed out in either direction, or a cancel; Cancelled is final; `restock: true` only with a cancel, puts each line's quantity back on items that still exist in the same transaction and never touches `modified_at`; 409 `conflict` with the current order, 404 `not-found`), `GET /api/settings` (`{ orderEmailOn }`) and `POST /api/settings` (`{ orderEmailOn: { from, to } }`, guarded; 409 `conflict` with the current value). Shop settings: `POST /api/settings/prices` (`{ currency?: { from, to }, defaultPriceCents?: { from, to } }`, at least one, read back through `GET /api/meta`; `currency` is one of MYR, SGD or CNY (all 2 decimals; the symbols RM, $ and ¥ come from the site's own table in `src/shared/format/currencies.ts`, which the shop, the admin and the order email all print through), the price a whole number of cents from 0 to 99,999; guarded all or nothing; 200 `{ currency, defaultPriceCents }` also for a retry, 409 `conflict` with the stored values; it only relabels prices, never rewrites item prices or orders). Clubs: `GET /api/clubs` (`{ clubs }` in shown order, each with `id`, `name`, `area`, `language`, `location`, `churchName`), `POST /api/clubs` (Add, last in the list: 201 `{ clubs }`; 409 `name-taken` ignoring case; 400 `invalid` for a name over 100 UTF-16 code units (an emoji counts as two), "other", padding, control characters or an empty optional field), `POST /api/clubs/edit` (`{ id, from, to }`, guarded by every field; 200 also for a retry, 409 `conflict` with the list, 409 `name-taken`), `POST /api/clubs/remove` (`{ id, seen }`; 200 also when already gone; past orders keep their club text) and `POST /api/clubs/order` (`{ from, to }`, two orders of the same ids; renumbers positions 1..n all or nothing; 409 `conflict` with the list). Every club write answers with the whole list. `GET /pictures/<key>` serves a stored picture from R2 (binding `PICTURES`), and `POST /api/items/picture?id=&seen=` (raw `image/webp` or `image/png` body, at most 256 KB) stores a picture under a new key `items/<id>-<8 hex>.<webp|png>` if `seen` is still the item's current key (empty for none): 200 `{ item }`, 409 `conflict`, 400 `invalid`, 413 `too-large`, 415 `picture-only`; it sets `modified_at` and deletes the old object, and deleting a Club-added item deletes its picture. The Worker, not the database, sets `modified_at` on each admin save; an order's stock drop never changes it. To rebuild the page alone, run `npm run build:admin` in the repo root. After changing `admin/wrangler.jsonc`, make sure `admin/.dev.vars` exists first (`wrangler types` reads it to put `ADMIN_EMAILS` into `Env`; without it the typecheck fails), then run `npm run types:admin` and commit `admin/worker-configuration.d.ts`. The built page files in `admin/ui-dist/` are git-ignored.

Club inbox clean-up, for the order handler: every order email in the club inbox (the Google Group) holds the buyer's name, email and phone, and the nightly Old order removal deletes orders more than 12 months old from D1, but cannot reach it. Delete the order emails older than 12 months there, once a year. The Settings tab says the same.

### Deploying the API Worker (one time, on the Mac)

From `workers/`, in this order:

1. `npx wrangler login`.
2. `npx wrangler d1 create pem-pathfinder-store --location apac`.
3. Paste the printed `database_id` into `api/wrangler.jsonc` and commit it (it is not a secret).
4. `npm run db:migrate:remote`. It uses your wrangler login, never the CI token.
5. Make a Cloudflare API token for this one account with Workers Scripts: Edit only (no D1 permission; CI never touches the database) and save it as the repository secret `CLOUDFLARE_API_TOKEN`. The account ID is not a secret: it sits in `api/wrangler.jsonc` as `account_id`. If the first deploy says a permission is missing, add only what it names.
6. In the Actions tab, run "Deploy API Worker" by hand once (Run workflow on `main`).

After that, a push to `main` that touches `workers/`, `src/shared/format/` (the money formatter the order email bundles) or `.nvmrc` runs `.github/workflows/deploy-workers.yml`. A test job with no secrets runs `npm ci`, typecheck and tests; only if they pass, a deploy job installs with `npm ci --ignore-scripts` (no package script ever runs next to the token) and `cloudflare/wrangler-action` deploys. A failing test stops the deploy and the live Worker stays as it was. Only `main` deploys, even from the Run workflow button. Until the token secret exists the deploy job skips with a notice. Remote migrations stay manual (step 4), never in CI. After each deploy, open `https://pem-pathfinder-store-api.<account>.workers.dev/items`: 200 with a JSON list.

To undo a bad deploy: run `npx wrangler rollback --config api/wrangler.jsonc` from `workers/` on the Mac, then revert the bad commit and push, or the next push deploys it again. A rollback restores the Worker code only; it never undoes a database migration.

### Deploying the Admin Worker

The Admin Worker (`pem-pathfinder-store-admin`) reuses the `CLOUDFLARE_API_TOKEN` secret and the database from the API Worker steps above. `.github/workflows/deploy-admin-worker.yml` runs on a push to `main` that touches `workers/`, `src/`, `admin.html`, `vite.admin.config.ts`, the root `package.json` or lockfile, a `tsconfig*.json`, or `.nvmrc`. A test job with no secrets installs the root and `workers/` dependencies, builds the admin page, runs typecheck and tests, and uploads the built page. Only if they pass, a deploy job installs `workers/` with `npm ci --ignore-scripts` (no package script ever runs next to the token), downloads that page and runs `wrangler deploy --config admin/wrangler.jsonc`. Only `main` deploys, even from the Run workflow button. Until the token secret exists the deploy job skips with a notice. The push also runs the API workflow, which has its own tests and deploy.

`ACCESS_AUD` in `admin/wrangler.jsonc` is already the live Access application's tag. To set the Worker up again (a new account or application), a first deploy refuses every request until step 3. In order:

1. Pushing this workflow to `main` runs "Deploy Admin Worker". In the Actions tab, check that it ran and deployed; if it skipped (no token yet) or did not run, run it by hand once (Run workflow on `main`). The Worker goes live and refuses everything: its address, `https://pem-pathfinder-store-admin.<account>.workers.dev`, answers 403. If it answers 200, roll back now (see the last paragraph).
2. In the Cloudflare dashboard, open Workers & Pages, then `pem-pathfinder-store-admin`, then "Protect this Worker behind Access". Use one policy that allows only the admins' emails, the One-time PIN login and a 1-month session.
3. Copy the Access AUD tag (in the Cloudflare dashboard under Zero Trust, then Access controls, then Applications, then the Worker's application; if the dashboard does not show it, it is the `kid` value in the sign-in link the admin address now redirects to: `curl -s -o /dev/null -w '%{redirect_url}' <admin address>`), paste it as the value of `ACCESS_AUD` in `workers/admin/wrangler.jsonc`, then commit and push.
4. From `workers/`, run `npx wrangler secret put ADMIN_EMAILS --config admin/wrangler.jsonc` and enter the same emails as the policy, separated by commas.
5. In a private window, open the address, sign in with the emailed code, save one stock change, and see it on the API Worker's `/items`, then set the stock back and save again. With no session the address answers 302 to `*.cloudflareaccess.com`; if it answers 200, roll back now (see the last paragraph).
6. To add or remove an admin later, change both the Access policy's emails and `ADMIN_EMAILS`. Changing only one gives a 403 or no sign-in code.

To undo a bad deploy: run `npx wrangler rollback --config admin/wrangler.jsonc` from `workers/` on the Mac, then revert the bad commit and push, or the next push to `src/` or `workers/` (a site-only change included) deploys it again. The first deploy has no earlier version to go back to: in the Cloudflare dashboard, open Workers & Pages, then `pem-pathfinder-store-admin`, then Settings, then Domains & Routes, and turn off the workers.dev route. The site and the API Worker do not depend on the Admin Worker.
