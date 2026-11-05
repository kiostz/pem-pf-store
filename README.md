# PEM Pathfinder Store

Honors store for Pathfinder clubs. Static site (React, Vite, TypeScript, Tailwind) hosted on GitHub Pages at https://kiostz.github.io/pem-pf-store/.

## Run locally

Needs Node 24 (see `.nvmrc`).

    npm ci
    npm run dev

Open the address Vite prints. For the production build: `npm run build && npm run preview`, then open http://localhost:4173/pem-pf-store/.

## Where the shop gets its data

The shop reads its items, clubs and settings from the API Worker's `/shop`, one request per load, with a 30 second limit. `VITE_API_URL` holds the Worker's address: the live Worker in `.env`, and `/api` in `.env.development`. `npm run dev` proxies `/api` to the local API Worker on http://localhost:8787, so start that first (`npm run dev` in `workers/`, see "Workers"); with it stopped the shop shows "We couldn't load the shop." `npm run preview` serves the production build, which asks the live Worker, and the Worker allows only the live site's address, so the shop can't load from `localhost` there.

### Stock on screen, and the order of the first pushes

Each card shows "Stock: N left"; at 0 it shows Sold out in place of Add, and the steppers stop at the stock. A cart line above today's stock, or Sold out, is marked in red and blocks Checkout until the buyer lowers or removes it (their saved cart is never changed for them). Home ends with an "Admin" link to the live Admin Worker. While the shop loads, Shop, Cart and Details show grey skeletons after 300 ms.

Before the first push of this work, as the owner:

1. Enter the real stock in the live admin (stock starts at 0, so every card would read Sold out until then).
2. Push the Worker change and wait for "Deploy API Worker" to finish, so `/shop` is live.
3. Then push the site. Pushing both at once can put Pages live before `/shop`, and the shop shows "We couldn't load the shop." for about a minute.

Orders now go through the API Worker (see "Endpoints"), so a sent order lowers stock by itself. Push order for the owner: create the Turnstile widget for `kiostz.github.io` in Cloudflare and paste its sitekey into `.env` (the production build fails while it is missing or still the placeholder, so a failed Pages build keeps the old site live); `wrangler secret put TURNSTILE_SECRET` and `ORDER_EMAIL_TO`; Email Routing on `stardew.win` with the club inbox verified; `npm run db:migrate:remote` in `workers/`; push the Worker change and wait for "Deploy API Worker"; then push the site. Until then the live shop still sends through Web3Forms.

## Order form settings

The order form reads two keys from the committed `.env` files, which are public by design:

- `VITE_TURNSTILE_SITEKEY`: `.env` holds the live widget's sitekey (a placeholder until the owner creates the widget); `.env.development` holds Cloudflare's published always-passing test sitekey, so the widget works on `localhost`.
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

Before `npm run dev`, copy `api/.dev.vars.example` to `api/.dev.vars` (git-ignored): it holds Cloudflare's published Turnstile test secret, a made-up club inbox and `SHOP_ORIGIN=http://localhost:5173`, so the local Worker accepts orders from the dev server. Run `npm run db:migrate:local` again after pulling: migration `0002` adds `orders.request_id`, and `0003` gives every honor `created_at` and `modified_at` (all existing rows get `2026-11-01T00:00:00.000Z`), makes names unique ignoring case, and adds five more indexes, which the admin list reads in order (the unique name index is the sixth). `npm run dev` serves the API Worker at http://localhost:8787. `api/wrangler.jsonc` holds an all-zero `database_id` until the owner creates the real database; local runs ignore it. Migrations are in `workers/migrations/`; an applied migration is never edited, a change is a new file.

    npm test
    npm run typecheck

Tests run inside workerd with the migrations applied. After changing `api/wrangler.jsonc`, run `npm run types` and commit `api/worker-configuration.d.ts`.

### Fill a fresh local database

A new local D1 starts empty. To fill it with the live shop's items, clubs and settings, run these from `workers/`. The first one reads the real database with your wrangler login, so only the owner runs it:

    npm run db:migrate:local
    npm run db:export:remote
    npm run db:fill:local

`db:export:remote` writes `api/.wrangler/fill.sql` (git-ignored; the script creates the folder if it is missing). It names three tables only, `honors`, `clubs` and `settings`, so no order or buyer data is exported. The export briefly blocks other requests to the database, so run it when the shop is quiet. `db:fill:local` runs that file on the local database. The export carries `items/` keys, so the local shop shows pictures once the local R2 holds them. Run it on a fresh database only, never on one that already has rows: it fails on the first duplicate. To start over, delete `api/.wrangler/state` and run `db:migrate:local` again.

### Endpoints

The API Worker answers JSON with `Cache-Control: no-store`. The four `GET` reads:

- `/items`: active honors by name (ignoring case, equal names by id), as `{ id, name, category, priceCents, stock, image }` (RM 4.00 is `400`). Hidden honors never appear.
- `/clubs`: the clubs in their set order, as `{ name, area, language, location, churchName }`.
- `/settings`: `{ currency }` only.
- `/shop`: `{ items, clubs, settings }` in one D1 batch, the same three lists as above, so a shop load is one request; a missing settings row answers 500 `server`.

- `POST /orders` (and `OPTIONS /orders`, the browser's preflight, 204): takes an order and answers 201 with the saved order (`number`, `createdAt`, `currency`, `totalCents`, `lines` with the saved names and prices, no buyer fields). Body: `requestId` (a UUID the shop keeps for a retry), `turnstileToken`, `name`, `email`, `phone`, `club` (`{ name, typed }`) and `lines` (`{ honorId, quantity }`, 1 to 500, quantity 1 to 99); the body is at most 64 KB. Order of checks: `Origin` must be exactly `SHOP_ORIGIN` (403 `forbidden-origin`), body (400 `invalid`, no field named), Turnstile (403 `captcha`, 503 `captcha-unavailable`), a repeated `requestId` (200 with the same saved order, no second order, stock drop or email), stock (409 `{ error: 'stock', lines: [{ honorId, stock }] }` listing every line that cannot be filled, `stock: null` for a Hidden or unknown item, nothing written). The save is one guarded D1 batch: the order, its lines (names and prices read from D1, not the request) and the lowered stock commit together or not at all. The order number is `PF-YYYYMMDD-XXXX` with the Malaysia date. After the save, when Settings has the order email On, the Worker sends the order email through the `ORDER_EMAIL` binding from `orders@stardew.win` to the secret `ORDER_EMAIL_TO`, reply-to the buyer; a failed send is logged (order number and error name only) and the order stays saved. Locally `wrangler dev` writes the email to a file and prints its path. Secrets (never in the repo): `TURNSTILE_SECRET` and `ORDER_EMAIL_TO`, set by the owner with `wrangler secret put`; vars `ORDER_EMAIL_FROM` and `ADMIN_URL` are in `api/wrangler.jsonc`. Logs never hold a buyer's name, email, phone or club.

Old order removal: every day at 19:00 UTC (03:00 in Malaysia) the API Worker's `scheduled` handler (cron `0 19 * * *`, `triggers.crons` in `api/wrangler.jsonc`) deletes every order placed more than 12 months before the run, with its order lines (the foreign key cascades). Every step goes alike; items, clubs and settings are never touched and nothing is restocked. The log holds one line, `old orders deleted <count>`, or `old order removal failed <error name>`, and then the run itself fails with a fixed error; the next night tries again. Check the API Worker's cron history in the Cloudflare dashboard and its log for that line: a red run means orders older than 12 months are still held. To run it locally, start the API Worker with the test trigger and call it (it deletes from your local D1, so seed made-up orders first):

    npx wrangler dev --config api/wrangler.jsonc --test-scheduled
    curl "localhost:8787/__scheduled?cron=0+19+*+*+*"

The link on the order email's last line is `ADMIN_URL` plus `/#/orders/<number>`; for local runs put `ADMIN_URL=http://localhost:8788` in `api/.dev.vars` (see `api/.dev.vars.example`).

Paths match exactly, so `/items/` is 404. Errors are a short code only: 404 `not-found`, 405 `method-not-allowed` (with `Allow: GET`, or `Allow: POST, OPTIONS` on `/orders`), 429 `rate-limited` (with `Retry-After: 60`), 500 `server`. CORS: `Access-Control-Allow-Origin` is sent only when `Origin` is exactly `https://kiostz.github.io` (the `SHOP_ORIGIN` var); other callers still get the body. A rate limit of 60 requests per 60 seconds per client IP (the `RATE_LIMITER` binding in `api/wrangler.jsonc`) answers 429 past it; `wrangler dev` enforces it locally too. Cloudflare's docs imply the free plan includes this binding; confirm it at the first deploy.

### Admin Worker (local)

`workers/admin/` is the Admin Worker: the admin page (the Items screen) and the admin API behind Cloudflare Access. Every path answers 403 unless Access signed in an admin whose email is in `ADMIN_EMAILS`. Locally `wrangler dev` simulates Access (`access.dev` in `admin/wrangler.jsonc`), reading `workers/admin/.dev.vars` (git-ignored). Create it once:

    ACCESS_AUD=local-dev
    ADMIN_EMAILS=admin@example.test, second@example.test

Then, with the API Worker's database migrated and filled, from `workers/`:

    npm run dev:admin

`dev:admin` first runs the root `build:admin` (the Vite build of `admin.html` and `src/admin-main.tsx` into `admin/ui-dist/`), so a fresh clone serves the real page; `deploy:admin` does the same. It serves http://localhost:8788 (a tab bar with Items, Orders, Clubs and Settings, at `#/items`, `#/orders` and `#/orders/<number>`, `#/clubs`, `#/settings`) on the same local D1 as `npm run dev`. The admin API: `GET /api/items?sort=changed|newest|name&q=&category=&cursor=` (pages of 50 with `nextCursor`, no total; 400 `invalid` for anything else), `GET /api/meta` (currency, default price, the 11 categories), `POST /api/items/changes` (guarded save of name, category, price, status and stock; 409 `conflict` with `deletedIds`, or `name-taken`), `POST /api/items` (Add: Hidden, stock 0, `Club`) and `POST /api/items/delete` (Club-added items only). Orders and settings: `GET /api/orders?step=new|paid|handed_out|cancelled&cursor=` (pages of 50, newest first, each order with its lines and `inShop`; `?number=PF-YYYYMMDD-XXXX` looks one up and cannot be combined with `step` or `cursor`; 400 `invalid` for anything else), `POST /api/orders/step` (`{ number, from, to, restock }`: a guarded step change among New, Paid and Handed out in either direction, or a cancel; Cancelled is final; `restock: true` only with a cancel, puts each line's quantity back on items that still exist in the same transaction and never touches `modified_at`; 409 `conflict` with the current order, 404 `not-found`), `GET /api/settings` (`{ orderEmailOn }`) and `POST /api/settings` (`{ orderEmailOn: { from, to } }`, guarded; 409 `conflict` with the current value). Clubs: `GET /api/clubs` (`{ clubs }` in shown order, each with `id`, `name`, `area`, `language`, `location`, `churchName`), `POST /api/clubs` (Add, last in the list: 201 `{ clubs }`; 409 `name-taken` ignoring case; 400 `invalid` for a name over 100 UTF-16 code units (an emoji counts as two), "other", padding, control characters or an empty optional field), `POST /api/clubs/edit` (`{ id, from, to }`, guarded by every field; 200 also for a retry, 409 `conflict` with the list, 409 `name-taken`), `POST /api/clubs/remove` (`{ id, seen }`; 200 also when already gone; past orders keep their club text) and `POST /api/clubs/order` (`{ from, to }`, two orders of the same ids; renumbers positions 1..n all or nothing; 409 `conflict` with the list). Every club write answers with the whole list. `GET /pictures/<key>` serves a stored picture from R2 (binding `PICTURES`), and `POST /api/items/picture?id=&seen=` (raw `image/webp` or `image/png` body, at most 256 KB) stores a picture under a new key `items/<id>-<8 hex>.<webp|png>` if `seen` is still the item's current key (empty for none): 200 `{ honor }`, 409 `conflict`, 400 `invalid`, 413 `too-large`, 415 `picture-only`; it sets `modified_at` and deletes the old object, and deleting a Club-added item deletes its picture. The Worker, not the database, sets `modified_at` on each admin save; an order's stock drop never changes it. To rebuild the page alone, run `npm run build:admin` in the repo root. After changing `admin/wrangler.jsonc`, make sure `admin/.dev.vars` exists first (`wrangler types` reads it to put `ADMIN_EMAILS` into `Env`; without it the typecheck fails), then run `npm run types:admin` and commit `admin/worker-configuration.d.ts`. The built page files in `admin/ui-dist/` are git-ignored.

Club inbox clean-up, for the order handler: every order email in the club inbox (the Google Group) holds the buyer's name, email and phone, and the nightly Old order removal deletes orders more than 12 months old from D1, but cannot reach it. Delete the order emails older than 12 months there, once a year. The Settings tab says the same.

### Deploying the API Worker (one time, on the Mac)

From `workers/`, in this order:

1. `npx wrangler login`.
2. `npx wrangler d1 create pem-pathfinder-store --location apac`.
3. Paste the printed `database_id` into `api/wrangler.jsonc` and commit it (it is not a secret).
4. `npm run db:migrate:remote`. It uses your wrangler login, never the CI token.
5. Make a Cloudflare API token for this one account with Workers Scripts: Edit only (no D1 permission; CI never touches the database) and save it as the repository secret `CLOUDFLARE_API_TOKEN`. The account ID is not a secret: it sits in `api/wrangler.jsonc` as `account_id`. If the first deploy says a permission is missing, add only what it names.
6. In the Actions tab, run "Deploy API Worker" by hand once (Run workflow on `main`).

After that, a push to `main` that touches `workers/` or `.nvmrc` runs `.github/workflows/deploy-workers.yml`. A test job with no secrets runs `npm ci`, typecheck and tests; only if they pass, a deploy job installs with `npm ci --ignore-scripts` (no package script ever runs next to the token) and `cloudflare/wrangler-action` deploys. A failing test stops the deploy and the live Worker stays as it was. Only `main` deploys, even from the Run workflow button. Until the token secret exists the deploy job skips with a notice. Remote migrations stay manual (step 4), never in CI. After each deploy, open `https://pem-pathfinder-store-api.<account>.workers.dev/items`: 200 with a JSON list.

To undo a bad deploy: run `npx wrangler rollback --config api/wrangler.jsonc` from `workers/` on the Mac, then revert the bad commit and push, or the next push deploys it again. A rollback restores the Worker code only; it never undoes a database migration.

### Deploying the Admin Worker

The Admin Worker (`pem-pathfinder-store-admin`) reuses the `CLOUDFLARE_API_TOKEN` secret and the database from the API Worker steps above. `.github/workflows/deploy-admin-worker.yml` runs on a push to `main` that touches `workers/`, `src/`, `admin.html`, `vite.admin.config.ts`, the root `package.json` or lockfile, a `tsconfig*.json`, or `.nvmrc`. A test job with no secrets installs the root and `workers/` dependencies, builds the admin page, runs typecheck and tests, and uploads the built page. Only if they pass, a deploy job installs `workers/` with `npm ci --ignore-scripts` (no package script ever runs next to the token), downloads that page and runs `wrangler deploy --config admin/wrangler.jsonc`. Only `main` deploys, even from the Run workflow button. Until the token secret exists the deploy job skips with a notice. The push also runs the API workflow, which has its own tests and deploy.

The first deploy refuses every request: `ACCESS_AUD` in `admin/wrangler.jsonc` is a placeholder until step 3. In order:

1. Pushing this workflow to `main` runs "Deploy Admin Worker". In the Actions tab, check that it ran and deployed; if it skipped (no token yet) or did not run, run it by hand once (Run workflow on `main`). The Worker goes live and refuses everything: its address, `https://pem-pathfinder-store-admin.<account>.workers.dev`, answers 403. If it answers 200, roll back now (see the last paragraph).
2. In the Cloudflare dashboard, open Workers & Pages, then `pem-pathfinder-store-admin`, then "Protect this Worker behind Access". Use one policy that allows only the admins' emails, the One-time PIN login and a 1-month session.
3. Copy the Access AUD tag (in the Cloudflare dashboard under Zero Trust, then Access controls, then Applications, then the Worker's application; if the dashboard does not show it, it is the `kid` value in the sign-in link the admin address now redirects to: `curl -s -o /dev/null -w '%{redirect_url}' <admin address>`), paste it as the value of `ACCESS_AUD` in `workers/admin/wrangler.jsonc`, then commit and push.
4. From `workers/`, run `npx wrangler secret put ADMIN_EMAILS --config admin/wrangler.jsonc` and enter the same emails as the policy, separated by commas.
5. In a private window, open the address, sign in with the emailed code, save one stock change, and see it on the API Worker's `/items`, then set the stock back and save again. With no session the address answers 302 to `*.cloudflareaccess.com`; if it answers 200, roll back now (see the last paragraph).
6. To add or remove an admin later, change both the Access policy's emails and `ADMIN_EMAILS`. Changing only one gives a 403 or no sign-in code.

To undo a bad deploy: run `npx wrangler rollback --config admin/wrangler.jsonc` from `workers/` on the Mac, then revert the bad commit and push, or the next push to `src/` or `workers/` (a site-only change included) deploys it again. The first deploy has no earlier version to go back to: in the Cloudflare dashboard, open Workers & Pages, then `pem-pathfinder-store-admin`, then Settings, then Domains & Routes, and turn off the workers.dev route. The site and the API Worker do not depend on the Admin Worker.
