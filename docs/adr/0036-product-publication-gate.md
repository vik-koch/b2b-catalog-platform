# 0036 — A product reaches the storefront only when an admin publishes it

**Status:** accepted · **Date:** 2026-08-16

## Context

FR-ADM-02's bulk sync creates products from a file: it upserts by the private
source id and soft-deletes what the source no longer lists. Whatever it creates
is live the moment it is written, because there is no state in which a product
exists but is not for sale. `products.deletedAt` is the only visibility control
there has ever been, and it means "gone from the source", not "not ready".

That was tolerable while a product's public correctness was entirely file-owned.
ADR 0035 ends it: the **price basis** — how many pieces the stored price covers —
is entered by hand and is not in the sync file, and a price of 9.99 means a
hundredfold different thing at a basis of 100 than at 1. A freshly synced product
simply has the column default. So the sync can now publish a wrong price at full
visibility, with nothing wrong in the file and nobody having made a mistake, and
any future admin-owned commercial field shares the shape.

A second, older motivation: a hand-made product is live from its first save, so
an admin composing one is doing it in public.

Alternatives seriously considered:

- **A single product `status` enum** (`draft | published | deleted`) replacing
  the existing `deletedAt` pair.
- **Publishing as a sync option** — a per-run "publish new products" flag,
  leaving the default behaviour intact for deployments that want it.
- **Requiring the basis in the sync file**, making the whole problem disappear by
  putting the field back under file ownership.
- **Doing nothing**, and relying on staff to review a sync's diff preview before
  committing it, which FR-ADM-02 already offers.

## Decision

A product is publicly visible only when `products.publishedAt` is set — a second
nullable timestamp beside `deletedAt`, with `publishedBy` beside `deletedBy` —
and the bulk sync never sets it, so every product it creates waits for an admin.

## Rationale

**Two nullable timestamps rather than one status enum**, because publication and
soft-deletion are independent axes, not points on one line: a product can be
synced, never published, and then vanish from the source, and an enum would need
a value for that combination or would lose one of the two. Two columns express
every combination by construction. The pair also matches `pages`, `categories`
and `app_settings`, and `publishedBy` answers "who let this go live" the way
`deletedBy` answers "who hid this" — worth recording, since publishing is the act
that accepts responsibility for a price.

**The sync never publishes, rather than publishing behind a flag.** A per-run
option makes the safe behaviour opt-in, and the run that most needs the gate is
the routine one nobody is watching. Unconditional costs one review step on
genuinely new products, which are the rare case in a periodic price sync.

**Not requiring the basis in the sync file**, though it would dissolve the
problem. The source system does not supply it, so requiring it means either
blocking on a legacy export nobody controls, or inventing a value in the
converter — the same wrong price, with the mistake buried a layer deeper.

**Not relying on the diff preview** (0026), which answers a different question.
It shows what the _file_ will change, and the file is not where the problem is:
the basis is absent from it, so the preview can be correct and complete while a
reviewer approves a product at a basis of 1 that should have been 100.

Publication is deliberately not a workflow — no draft/review/approve chain, no
scheduled publication. One reversible act by one admin; the shop is a handful of
staff, and any further state is state somebody has to maintain.

## Consequences

- (+) A synced product can no longer reach the storefront with an unreviewed
  price. The catalog gains a staging state it has never had.
- (+) An admin can build a product across several saves — images, description,
  tier prices — without any of it being public or indexable meanwhile.
- (+) Unpublishing is the reversible middle ground between "live" and the
  terminal soft delete, which the catalog previously lacked: taking a product off
  sale temporarily meant deleting it.
- (−) **The migration must backfill `publishedAt` for every existing product**,
  or the entire catalog disappears on the deploy that applies it. Precedent for
  a data-only statement inside a generated migration is `0006`'s
  `UPDATE users SET status = 'active'`.
- (−) Every public read gains the predicate — listings, product detail, search,
  **and the sitemap**. One forgotten call site leaks unpublished products
  silently, and the sitemap is the one most easily forgotten because it is not a
  page anyone looks at.
- (−) A large first sync lands a large review queue. The admin list's new
  `unpublished` filter (FR-ADM-05) is what makes that workable, and bulk
  publishing from the list is the obvious next thing to want if it hurts.
- (−) A product can now be invisible for a reason that is not an error, so
  "why can't I see it" gains a second answer, and staff have to know both.
- (⚠) Publication is orthogonal to soft-deletion, so restoring a soft-deleted
  product does **not** make it visible if it was never published. Restore and
  publish are two acts, and the UI must not imply otherwise.
