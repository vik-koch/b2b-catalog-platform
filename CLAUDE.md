# Project brief

`b2b-catalog-platform` is a B2B catalog and ordering platform for small wholesale businesses,
built for a real client and public as a portfolio piece. The public repo carries fictional demo
shops only: **nothing about the client** (its name, providers, location or jurisdiction) goes
into it. That lives in a private repo, which uses only what this one publishes. Right-sizing is
the recurring theme: the smallest component that does the job, on one VM.

## Where things are

- **The product:** [README.md](README.md), `docs/features.md`, `docs/requirements.md` (FR-\*/
  NFR-\* IDs), `docs/roadmap.md` (iterations), `docs/scope-and-limitations.md`.
- **How it fits together**, including the modelling rules the domain rests on (role ≠ tier, a
  price per piece, an order as versions): `docs/architecture.md`. Every decision with its
  alternatives: `docs/adr/`.
- **Running, checking, generated files, database changes:** `docs/development.md`.
- **Contracts and entry points:** `libs/shared/README.md`. **Building blocks:** `libs/ui/README.md`.
  **Colours and icons:** `docs/design-language.md`.
  **A deployment's config and texts:** `deployments/fixture/config/README.md`.
- **Behaviour:** `docs/order-lifecycle.md`, `docs/account-lifecycle.md`, `docs/mail.md`, and
  for the back-office exchanges `docs/exchange-areas.md` with the `*-sync.md` and
  `*-machine-api.md` pairs.

## Rules for every change

- A change in behaviour starts as a requirement; a decision that shapes the code gets an ADR.
- One Zod contract per API route in `libs/shared`, implemented and called through oRPC. A
  `*.contract.ts` exports schemas only; limits and helpers live in import-free modules, so Zod
  stays out of the browser. After changing a route: `node tools/generate-contract-routes.mjs`.
  A refusal travels as a contract error code, never as a message.
- Audience, then area, at every level: `<audience>/<area>/`, `core/<area>/` for what a second
  audience uses, `platform/` for what knows no area, in the API, `libs/shared` and the web app;
  texts by audience only. No audience imports another, areas follow the table in
  `tools/lint/area-boundaries.mjs`, and only the roots compose (ADR 0069, ADR 0073).
- The UI's wording comes from the deployment's text files, one language per deployment, no i18n
  framework. A new or moved text or config key lands in the fixture and in every directory under
  `deployments/`, and in the release's `tools/config-migration` map: a moved one names where it
  came `from`, a new one carries its `new` value. `node tools/migrate-config.mjs --check` proves it.
- Generated files are regenerated in the same change (the table in `docs/development.md`).
- A batch is done after `npx nx format:write --base=main` has run after its last edit
  (`--uncommitted` skips new, untracked files), and lint, tests and the `node tools/*` checks of
  `ci.yml` pass. A slice is done when the e2e suites pass as well.
- A schema change adds first and removes what it replaces a release later. Versions follow ADR
  0044: major when a port contract breaks or a migration cannot run unattended, minor for new
  scope, patch otherwise. The machine API stays stable; config keys are version-neutral.

## Style

- Comments are short and say why: a trap, an ordering constraint, an invariant the code cannot
  show. No history (what it was, which iteration, phase or ADR changed it), no restating of the
  code; a colon or a full stop reads better than an em dash.
- Names in code are US English (`color`, `customize`); comments and docs are British. A spelling
  already stored or on the wire keeps it: the `cancelled` order status and the names that mirror
  it, seed bundle fields, text and config keys.
- Hand-written Markdown tables are compact under a `<!-- prettier-ignore -->` line; generated
  tables stay as their generator writes them.

## Workflow

Trunk-based: short-lived `feat/123-*`, `fix/123-*` or `debt/123-*` branches into `main` through
a pull request and green CI; issue titles carry requirement IDs (`[FR-CAT-04] …`). A merge
deploys the German demo shop (dev), a release tag the English one (prod).
