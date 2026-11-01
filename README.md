# PEM Pathfinder Store

Honors store for Pathfinder clubs. Static site (React, Vite, TypeScript, Tailwind) hosted on GitHub Pages at https://kiostz.github.io/pem-pf-store/.

## Run locally

Needs Node 24 (see `.nvmrc`).

    npm ci
    npm run dev

Open the address Vite prints. For the production build: `npm run build && npm run preview`, then open http://localhost:4173/pem-pf-store/.

## Order form settings

The order form reads two keys from the committed `.env` files, which are public by design:

- `VITE_WEB3FORMS_ACCESS_KEY` in `.env` (a placeholder until the order handler's Web3Forms key is pasted in; switching inbox later changes only this line).
- `VITE_HCAPTCHA_SITEKEY`: `.env` holds Web3Forms' shared sitekey for the production build; `.env.development` holds hCaptcha's always-passing test key, because hCaptcha refuses `localhost` with a real key.

To try the whole order flow without a real send, run `npm run dev -- --mode fake-send`: `.env.fake-send` (dev only, never part of the build) makes Send order wait 800 ms, log the email subject and text to the browser console and succeed, with hCaptcha's test key. The order text in that console log holds the buyer's details, so use made-up ones. A real send cannot pass hCaptcha on `localhost`; it is tried once on the live site.

`public/data/clubs.json` is a list of clubs: `name` plus `area`, `language`, `location` and `churchName` (each text or `null`). The seed's `--force` still writes `[]`, which is valid.

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
