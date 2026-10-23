# 0012 — Apply migrations via a one-shot container; run them from the app bundle

**Status:** accepted · **Date:** 2026-07-21 · **Amended:** 2026-10-19 (the
seed leaves the API image) — see the _Amendment_ below

## Context

The Postgres schema must be migrated on every deploy, and seed data upserted,
before the app serves. The stack runs several containers from one image (api,
web), and local dev plus the e2e harness need the schema too. Migrations are
authored with drizzle-kit, but the runtime image ships a webpack bundle — no
drizzle-kit dependency, no TS config. Ordering must be explicit: schema before
the API serves and before seeding, with no two containers racing to migrate.

## Decision

- A dedicated one-shot **`migrate`** service (`RUN_MODE=migrate`, reusing the
  API image) applies migrations, then exits. `api` waits on it
  (`depends_on: service_completed_successfully`); `up` runs it first.
- The API **does not migrate on boot** — it only serves. Migration is an
  explicit step everywhere else: the e2e harnesses run it in their setup, and
  local dev runs it via the `db-migrate` target (or the `serve-fresh` target,
  which chains migrate → seed → serve).
- Seeding is a separate `tools`-profile one-shot (`RUN_MODE=seed`), run by the
  deploy after `up`.

## Rationale

1. **Explicit ordering, no race.** A completed-successfully dependency replaces
   timing/retries and is replica-safe — multiple api containers never migrate
   concurrently.
2. **The bundle is the one runner everywhere.** Reusing the API image keeps
   migrations in the artifact (0007) — no drizzle-kit at runtime — and makes
   local `db-migrate` exercise the exact prod path, including the
   migrations-copy step, so a bundling regression surfaces on the workstation.
3. **Migration is explicit everywhere, like seeding.** Decoupling it from the
   server keeps a single mental model (migrate & seed are steps; serve serves),
   makes the API replica-safe by construction rather than by no-op, and removes
   the second `runMigrations()` call site.

Rejected: `drizzle-kit migrate` in CD (would need the dev dependency + TS config
in the runtime image); migrating only on API boot (races across
containers/replicas and couples migration to serving).

## Consequences

- (+) Deterministic `postgres → migrate → api/seed` ordering; replica-safe.
- (+) One migration runner across stack, local, and e2e; drizzle-kit only
  authors migrations.
- (−) The `migrate` one-shot reruns on every `up` (idempotent, cheap).
- (−) Local `nx serve api` no longer sets up the schema on its own; a clean
  setup needs `db-migrate` (and `db-seed`) first — the `serve-fresh` target
  bundles all three.

## Amendment — 2026-10-19 (v1.15.0): the seed leaves the API image

The `seed` one-shot no longer reuses the API image, and the seed no longer
carries its content. A separately built **seeder** (`apps/seeder`: one bundled
file plus the lockfile the build prunes) runs on a stock `node:24-alpine`,
installs its dependencies on every run, and reads the demo content from a
mounted **seed bundle** — JSON files and one HTML file per page, `seed/` for
the committed demo. With `SEED=1` the deploy copies both beside the stack; local
dev runs `nx run seeder:seed`, and `serve-fresh` chains migrate → seed → serve
as before.

Why: the image a real shop runs carried the whole demo — product texts, page
bodies, the demo accounts and their published password — and a second demo in
another language would have added a second one. As files, each demo deployment
brings its own bundle beside its config, and the image carries neither.

The seeder still writes plain SQL against the schema, so it is built from the
same commit as the images it seeds for. A published seed image was considered
and rejected: another multi-arch build per release, for a tool only demo stacks
run. The install on each run costs a few seconds and needs the registry
reachable from the stack, which a demo stack has.

## Amendment — 2026-10-23 (v1.15.0): seeding resets a stack

A seed no longer adds to what a database holds. Seeding a demo stack is a reset,
done by a script of its own, `infra/seed.sh`, after `deploy.sh` has brought the
stack up: the schema and the uploaded files are dropped, the `migrate` one-shot
builds the schema afresh, the bundle is loaded and the bootstrap admin created
again. Locally `nx run seeder:seed` does the same, and the web-e2e stack starts
each run from empty volumes.

A stack is reset only when what it would load changed: the reset records a hash
of the bundle, the seeder build and the stack's `deployment.json` on the schema,
and `SEED_FORCE=1` overrides it. Meanwhile the shop is closed through
maintenance mode rather than stopped: the api is restarted with the flag on,
answers from its cache while the schema goes, and is restarted on the new
database.

Why: no stack needed a seed on top of other data, and the upsert kept what a
bundle no longer had — products dropped from it, another deployment's orders
after a stack changed shops. A new schema rather than emptied tables, because
the migrations write rows of their own.

`deploy.sh` lost its `SEED` switch, so the deploy a real shop runs has no way to
reset anything. `seed.sh` refuses a database a reset did not make (it marks the
schema it creates) unless the database holds nothing a shop would miss. The
recreated admin keeps the deploy's password (`ADMIN_FORCE_PASSWORD_CHANGE=false`),
since a forced change would come back with every reset.
