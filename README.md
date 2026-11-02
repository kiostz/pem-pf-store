# PEM Pathfinder Store

Honors store for Pathfinder clubs. Static site (React, Vite, TypeScript, Tailwind) hosted on GitHub Pages at https://kiostz.github.io/pem-pf-store/.

## Run locally

Needs Node 24 (see `.nvmrc`).

    npm ci
    npm run dev

Open the address Vite prints. For the production build: `npm run build && npm run preview`, then open http://localhost:4173/pem-pf-store/.

## Where the shop gets its data

The shop reads its items, clubs and settings from the API Worker's `/shop`, one request per load, with a 30 second limit. `VITE_API_URL` holds the Worker's address: the live Worker in `.env`, and `/api` in `.env.development` and `.env.fake-send`. `npm run dev` proxies `/api` to the local API Worker on http://localhost:8787, so start that first (`npm run dev` in `workers/`, see "Workers"); with it stopped the shop shows "We couldn't load the shop." `npm run preview` serves the production build, which asks the live Worker, and the Worker allows only the live site's address, so the shop can't load from `localhost` there. The files in `public/data/` stay for the seed and the import but the shop no longer reads them.

## Order form settings

The order form reads two keys from the committed `.env` files, which are public by design:

- `VITE_WEB3FORMS_ACCESS_KEY` in `.env` (a placeholder until the order handler's Web3Forms key is pasted in; switching inbox later changes only this line).
- `VITE_HCAPTCHA_SITEKEY`: `.env` holds Web3Forms' shared sitekey for the production build; `.env.development` holds hCaptcha's always-passing test key, because hCaptcha refuses `localhost` with a real key.

To try the whole order flow without a real send, run `npm run dev -- --mode fake-send`: `.env.fake-send` (dev only, never part of the build) makes Send order wait 800 ms, log the email subject and text to the browser console and succeed, with hCaptcha's test key. The order text in that console log holds the buyer's details, so use made-up ones. A real send cannot pass hCaptcha on `localhost`; it is tried once on the live site.

`public/data/clubs.json` (read by the import, not by the shop) is a list of clubs: `name` plus `area`, `language`, `location` and `churchName` (each text or `null`). The seed's `--force` still writes `[]`, which is valid.

## Seed the data

`npm run seed` writes `public/data/honors.json`, `clubs.json` and `settings.json` from `scripts/seed/adventist-honors.csv`. It refuses to overwrite existing files. To overwrite them, run:

    npm run seed -- --force

## Patch pictures

`npm run patches` copies each honor's patch picture from the Pathfinder Wiki into `public/patches/`, sets `image` in `public/data/honors.json` and writes `scripts/patches/import-report.md`. It needs `cwebp` (`brew install webp`). If it ends with failed requests, run it again: it only fetches the honors that still have no picture.

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

`npm run dev` serves the API Worker at http://localhost:8787. `api/wrangler.jsonc` holds an all-zero `database_id` until the owner creates the real database; local runs ignore it. Migrations are in `workers/migrations/`; an applied migration is never edited, a change is a new file.

    npm test
    npm run typecheck

Tests run inside workerd with the migrations applied. After changing `api/wrangler.jsonc`, run `npm run types` and commit `api/worker-configuration.d.ts`.

### One-time import

D1 starts empty. `npm run db:import:local` (in `workers/`, after `npm run db:migrate:local`) reads `public/data/honors.json`, `clubs.json` and `settings.json`, checks all three, and writes `workers/import/out/import.sql` (git-ignored) before running it on the local database. It creates every honor with stock 0 (`active` when `enabled` is true, otherwise `hidden`), price in whole cents (RM 4.00 becomes 400), the clubs at positions 1 to n, and the settings with the order email On. A bad file stops it before anything is written and the message names the file and entry.

The settings row goes in first, so a second run fails at once with `UNIQUE constraint failed: settings.id` and changes nothing; the import can never overwrite stock the admin has set. To start over locally, delete `workers/api/.wrangler/` and run `db:migrate:local` again. `db:import:remote` is the same against the real database and is run by the owner only, after the first deploy steps.

If a remote import stops part-way (for example the network drops), the settings row is already in and every re-run is refused. While the shop has no real stock or orders, empty the three import tables and run it again; run these from `workers/`, as the owner:

    npx wrangler d1 execute pem-pathfinder-store --remote --config api/wrangler.jsonc --command "DELETE FROM honors; DELETE FROM clubs; DELETE FROM settings;"
    npm run db:import:remote

Never do this once an admin has set stock or an order has arrived: it wipes the stock. The `orders` and `order_lines` tables are not touched by it, and Task 11 or later may keep them.

After the import, D1 is the source of truth. Do not edit the three JSON files in the meantime: a change there never reaches D1. The files stay until the shop reads from the Worker.

### Endpoints

The API Worker answers `GET` only, with JSON and `Cache-Control: no-store`:

- `/items`: active honors by name (ignoring case, equal names by id), as `{ id, name, category, priceCents, stock, image }` (RM 4.00 is `400`). Hidden honors never appear.
- `/clubs`: the clubs in their set order, as `{ name, area, language, location, churchName }`.
- `/settings`: `{ currency }` only.
- `/shop`: `{ items, clubs, settings }` in one D1 batch, the same three lists as above, so a shop load is one request; a missing settings row answers 500 `server`.

Paths match exactly, so `/items/` is 404. Errors are a short code only: 404 `not-found`, 405 `method-not-allowed` (with `Allow: GET`), 429 `rate-limited` (with `Retry-After: 60`), 500 `server`. CORS: `Access-Control-Allow-Origin` is sent only when `Origin` is exactly `https://kiostz.github.io` (the `SHOP_ORIGIN` var); other callers still get the body. A rate limit of 60 requests per 60 seconds per client IP (the `RATE_LIMITER` binding in `api/wrangler.jsonc`) answers 429 past it; `wrangler dev` enforces it locally too. Cloudflare's docs imply the free plan includes this binding; confirm it at the first deploy.

### Admin Worker (local)

`workers/admin/` is the Admin Worker: the admin page (the Items screen) and the admin API behind Cloudflare Access. Every path answers 403 unless Access signed in an admin whose email is in `ADMIN_EMAILS`. Locally `wrangler dev` simulates Access (`access.dev` in `admin/wrangler.jsonc`), reading `workers/admin/.dev.vars` (git-ignored). Create it once:

    ACCESS_AUD=local-dev
    ADMIN_EMAILS=admin@example.test, second@example.test

Then, with the API Worker's database migrated and imported, from `workers/`:

    npm run dev:admin

`dev:admin` first runs the root `build:admin` (the Vite build of `admin.html` and `src/admin-main.tsx` into `admin/ui-dist/`), so a fresh clone serves the real page; `deploy:admin` does the same. It serves http://localhost:8788 (the Items screen at `/`, `/api/items`, `POST /api/items/changes`) on the same local D1 as `npm run dev`. To rebuild the page alone, run `npm run build:admin` in the repo root. After changing `admin/wrangler.jsonc`, make sure `admin/.dev.vars` exists first (`wrangler types` reads it to put `ADMIN_EMAILS` into `Env`; without it the typecheck fails), then run `npm run types:admin` and commit `admin/worker-configuration.d.ts`. The built page files in `admin/ui-dist/` are git-ignored.

### Deploying the API Worker (one time, on the Mac)

From `workers/`, in this order:

1. `npx wrangler login`.
2. `npx wrangler d1 create pem-pathfinder-store --location apac`.
3. Paste the printed `database_id` into `api/wrangler.jsonc` and commit it (it is not a secret).
4. `npm run db:migrate:remote`, then `npm run db:import:remote`. These use your wrangler login, never the CI token.
5. Make a Cloudflare API token for this one account with Workers Scripts: Edit only (no D1 permission; CI never touches the database) and save it as the repository secret `CLOUDFLARE_API_TOKEN`. The account ID is not a secret: it sits in `api/wrangler.jsonc` as `account_id`. If the first deploy says a permission is missing, add only what it names.
6. In the Actions tab, run "Deploy API Worker" by hand once (Run workflow on `main`).

After that, a push to `main` that touches `workers/`, `public/data/` or `.nvmrc` runs `.github/workflows/deploy-workers.yml`. A test job with no secrets runs `npm ci`, typecheck and tests; only if they pass, a deploy job installs with `npm ci --ignore-scripts` (no package script ever runs next to the token) and `cloudflare/wrangler-action` deploys. A failing test stops the deploy and the live Worker stays as it was. Only `main` deploys, even from the Run workflow button. Until the token secret exists the deploy job skips with a notice. Remote migrations stay manual (step 4), never in CI. After each deploy, open `https://pem-pathfinder-store-api.<account>.workers.dev/items`: 200 with a JSON list.

To undo a bad deploy: run `npx wrangler rollback --config api/wrangler.jsonc` from `workers/` on the Mac, then revert the bad commit and push, or the next push deploys it again. A rollback restores the Worker code only; it never undoes a database migration or the import.

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
