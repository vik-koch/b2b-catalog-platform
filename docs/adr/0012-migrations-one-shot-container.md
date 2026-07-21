# 0012 — Apply migrations via a one-shot container; run them from the app bundle

**Status:** proposed · **Date:** 2026-07-21

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
