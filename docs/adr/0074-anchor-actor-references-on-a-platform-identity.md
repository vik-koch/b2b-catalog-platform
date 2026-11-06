# 0074 — Anchor who changed a row on an identity in platform

**Status:** accepted · **Date:** 2026-11-06

## Context

Every area records who changed a row: seventeen actor columns across catalog, ordering, site,
exchange and platform reference `users.id`. `users` belongs to accounts, so each of those schema
modules imports `core/accounts/accounts-schema.ts`, platform's included, while accounts imports
platform. [ADR 0073](0073-cut-the-code-by-area-and-audience.md) allows this as its one exception
(`ACTOR_REFERENCES` in `tools/lint/area-boundaries.mjs`), which leaves a cycle in the graph it
otherwise keeps downward. Platform's other needs from accounts are questions, answered through an
interface the root binds (`SESSION_USERS`); a foreign key is a reference in the schema, which no
interface can stand in for.

Considered:

- **Move `users` into platform.** Removes the cycle, but nearly every write to the table is
  accounts': registration, approval, status, passwords, names, erasure. Platform would hold the
  account lifecycle (`pending`, `invited`) and accounts would write a lower layer's table to do its
  own job.
- **Split the customer profile from `users`** (company, customer type, approval, `sourceId`, tier)
  into a one-to-one table. The rule it would express, customer data only on role `user`, fits a
  check constraint. Most readers want both halves; a promotion would delete a row instead of
  clearing two fields; erasure keeps `sourceId`, so the row could not simply go. A customer with
  several logins would make it many-to-one, and that shape is better designed when it is needed.
- **Keep the exception.** It is narrow and held by lint, but it is the graph's only upward edge,
  and it runs from every area.

## Decision

Platform owns `identities` (`id`, `createdAt`), and every actor column references it. `users.id`
is a foreign key to it, and triggers on `users` insert the identity with the account and delete it
with the account, so the two stay one to one. `users` stays one table in accounts, with two checks: a tier and a source key
only on role `user`, and a company name and registration id only on a company.

## Rationale

- **An id carries no rule.** It is the one thing every area refers to, and the only thing platform
  must hold for the references to point downward. Each further column brings a rule down with it:
  `status` the account lifecycle, a copied "may sign in" flag a second source of truth, `email` an
  erasure that writes to platform.
- **Accounts plays the identity provider.** Login, credentials, the second step, the person and
  roles stay where they are written; platform's session keeps asking for them through
  `SESSION_USERS`, as it reads machine tokens through `MACHINE_TOKENS`.
- **A trigger, not a call on every path.** Accounts are created by three services, the bootstrap
  admin, the seed and test setup in raw SQL, and by the previous release while the migration
  runs. A trigger on accounts' own table holds for each of them, as the triggers on `phone` and
  on disabling already do; the cost is that no TypeScript shows it, so the schema says it.
- **Deleting an account deletes its identity**, so a deletion still clears the actor columns
  naming it, or is refused where one forbids it, as when they referenced `users`. A further guard
  against deleting an identity directly is not needed: while its account exists, the foreign
  key refuses it.
- **References that mean a customer stay on `users`.** `orders.userId`, addresses, password links
  and sign-in codes point at the account, and their areas may import accounts.
- **`tokenVersion` is session revocation**, platform's mechanism, and could move to `identities`
  behind a `revokeAll(id)`. Left for its own change: it moves a write, not a reference.

## Consequences

- (+) The area graph has no upward edge; `ACTOR_REFERENCES` and its lint exception go.
- (+) The database holds what only service code held: staff carry no tier or source key, and a
  person carries no company fields.
- (−) An identity is a side effect of inserting or deleting an account, visible in the schema and
  the migration, not in the service that writes.
- (−) Creating an account writes two rows.
- (−) The migration repoints nineteen foreign keys (the seventeen plus accounts' own `approvedBy`
  and `signInStepExemptBy`) and checks the existing rows against the new constraints before it
  adds them.
