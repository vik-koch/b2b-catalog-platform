# Development

How to run the platform on your own machine, check a change, and keep the generated files
current. Deploying a shop is in [deploying-a-shop.md](deploying-a-shop.md); how the code is laid
out is in [architecture.md](architecture.md).

You need Node 24 and Docker with Compose.

## Running it locally

```sh
npm ci
cp .env.example .env
docker compose -f compose.db.yml up -d   # Postgres on 5432, Mailpit on 8025, media on 8027
npx nx run seeder:seed                   # empties the database, migrates, loads the seed bundle, creates the admin
npx nx serve api                         # http://localhost:3000/api
npx nx serve web                         # http://localhost:4200
```

- **Signing in.** The admin is `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. The seeded
  customers and managers share the password in the bundle's `accounts.json`.
- **Mail** lands in Mailpit at http://localhost:8025; nothing leaves your machine.
- **Another shop.** `.env` points `CONFIG_PATH` and `SEED_PATH` at the test fixture. Point
  both at another directory under [deployments/](../deployments/README.md), for example
  `deployments/coffee-kontor-de/config` and `…/seed`, and seed again.
- **A fresh start.** `npx nx run api:serve-fresh` reseeds and then serves the API. Seeding
  always resets the database it is pointed at.

## Checking a change

```sh
npx nx run-many -t lint typecheck test build
npx nx format:write                      # or format:check, as CI runs it
npx nx e2e api-e2e                       # the API against its own stack: API 3100, Postgres 5435, Mailpit 8028
npx nx e2e web-e2e                       # the browser suite: builds the images, runs the stack on http://localhost:8080
```

Both end-to-end suites bring up and empty their own Compose stacks, so they never touch the
database you develop against, and they can run at the same time. The web suite runs a desktop
and a phone viewport.

`npx nx test web -c coverage` adds a coverage report under `coverage/web/` (open
`index.html`). It is a map of thin spots, not a gate: CI does not run it.

`npx nx run web-e2e:audit` opens every page listed in `apps/web-e2e/src/audit/routes.ts`, signed
out, as a customer, as an admin and in edit mode, on both viewports. It compares a screenshot of
each with `tmp/baselines/visual/` and its axe findings against WCAG 2.1 AA with
`tmp/baselines/a11y/`. Take the baseline before a change that moves markup (`--update-snapshots`),
then run it again after: a refactor should change no picture, and a finding fixed or added shows
as a difference. CI does not run it either.

CI runs a few more checks, each a plain Node script:

<!-- prettier-ignore -->
| Script | What it checks |
| --- | --- |
| `tools/check-licenses.mjs` | Every production dependency has an allowed licence |
| `tools/check-deployments.mjs` | Every committed deployment boots and seeds; `--config-dir <dir>` checks one config directory |
| `tools/check-aria-text.mjs` | A text meant only for screen readers is never shown on screen |
| `tools/check-initial-bundle.mjs` | The browser's first download stays within its budget and carries no Zod (after `nx build web --statsJson`); `--report` shows what the first load and each lazy page weigh, `--save`/`--baseline <file>` keep and compare a report |
| `tools/migrate-config.mjs --check` | The last release's config, migrated with this release's map, still loads |

## Generated files

Several files are generated from the code they describe, and CI fails when one is stale. Run
the generator in the same change:

<!-- prettier-ignore -->
| File | Regenerate after | Command |
| --- | --- | --- |
| `contract-routes.generated.ts` in `apps/web/src/app/shared/core/`, `storefront/` and `admin/` | changing a route's method, path or input/output structure | `node tools/generate-contract-routes.mjs` |
| The contents of `docs/requirements.md` | adding or retitling a requirement | `node tools/generate-requirements-index.mjs` |
| The index in `docs/adr/README.md` | adding an ADR or changing its status | `node tools/generate-adr-index.mjs` |
| `docs/mail.md`, `docs/mail/` | changing a mail template or its wording | `node tools/generate-mail-previews.mjs` |
| The tables and journeys in `docs/order-lifecycle.md`, `docs/account-lifecycle.md`, `docs/catalog-sync.md`, `docs/customer-sync.md`, `docs/order-sync.md` | changing a transition, a journey or a mail rule | `node tools/generate-order-lifecycle.mjs` and its siblings |

Each takes `--check` to report instead of write. The screenshots in `docs/images/` are taken by
hand with `node tools/take-screenshots.mjs`; nothing checks them.

## Database changes

The schema is [apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts). After changing it,
`npx nx run api:db-generate` writes a migration with drizzle-kit, and seeding or
`npx nx run api:db-migrate` applies it. On a server, the migrate container applies it before the
new apps start, so the running version briefly reads the new schema: add first, and remove what
it replaces a release later. A migration that cannot run unattended makes the release a major
([ADR 0044](adr/0044-versioning-by-what-a-release-changes.md)).

## Conventions

- **Requirements first.** A change in behaviour starts as a requirement in
  [requirements.md](requirements.md); a decision that shapes the code gets an ADR
  ([docs/adr/](adr/README.md)).
- **Trunk-based.** Short-lived `feat/123-…`, `fix/123-…` or `debt/123-…` branches into `main`,
  behind a pull request and green CI. Issue titles carry requirement IDs, such as `[FR-CAT-04] …`.
- **A text or config key changes in every deployment.** The fixture and each directory under
  `deployments/` carry the same keys. A release that moves keys ships a map in
  `tools/config-migration/<version>.json` for the deployments kept elsewhere.
- **Contracts export schemas only.** Limits and helpers a component needs live in import-free
  modules, so they do not pull Zod into the browser ([libs/shared](../libs/shared/README.md)).
- **Storefront, admin and shared.** A web file lives on the side that uses it, and moves to
  `shared/` only once both do; the contracts and the texts split the same way. Lint fails a
  wrong-way import ([ADR 0069](adr/0069-split-web-texts-and-contracts-by-audience.md)).
- **Colours are roles.** A template names what a colour does (`ink`, `surface-strong`,
  `danger`), never a Tailwind shade; lint refuses the palette. The names, the contrast floors and
  what each role is for are in [design-language.md](design-language.md).
- **Comments say why, briefly.** A comment is there for what the code cannot show: a trap, an
  ordering constraint, an invariant. It does not retell the code or its history; git and the
  ADRs hold that.
- **Names in code are US English** (`color`, `customize`), as the platform's own APIs are, so a
  search finds one spelling; comments and docs are British. A spelling already stored or on the
  wire keeps it: the `cancelled` order status is a Postgres enum and a machine API value, and the
  names that mirror it, the seed bundle's fields and the text and config keys stay as they are.
- **Tables in Markdown are written compact** under a `<!-- prettier-ignore -->` line, so adding
  a row changes one line.
- [CLAUDE.md](../CLAUDE.md) is the project brief the AI sessions work from, and the shortest
  summary of the rules above.
