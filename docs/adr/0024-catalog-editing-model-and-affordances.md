# 0024 — Edit the catalog in place, with soft-deleted products and guarded categories

**Status:** accepted · **Date:** 2026-07-30

## Context

FR-ADM-01 asks for admin editing of the product catalog: create, edit, and
remove products and categories. The catalog is already a public, SEO-indexed
storefront (FR-CAT-\*) with a stable read contract, slug URLs, and a
soft-delete-aware read model. The editing feature had to layer onto that without
destabilising the read side or bloating the public bundle, and it had to define
— not just implement — what an admin is allowed to do.

Two interaction models were on the table:

1. A **separate admin CRUD panel** (a `/admin/...` area with its own list/detail
   screens), the conventional back-office shape.
2. **In-place edit mode** on the storefront itself: an admin toggles a mode that
   reveals edit/add/delete affordances directly on the pages a visitor sees,
   editing the catalog where it lives.

And several policy questions each needed a defensible answer: what happens to a
removed product's URL and past references; whether a category can be deleted out
from under its products; and whether a product can exist without a category.

## Decision

Ship **both surfaces over one write contract**, weighted toward in-place editing:

- **In-place edit mode** is the primary affordance — an admin-only, browser-local
  toggle (`EditModeService`) that overlays pencil/trash/＋ controls on the
  storefront category grid and product page. Add/edit navigate to full editor
  routes; delete opens a confirmation dialog `@defer`-loaded so the admin write
  client never enters the public bundle.
- **Admin list pages** (`/admin/products`, `/admin/categories`) are the
  secondary surface, for scanning and bulk-managing the whole catalog.
- **Products are soft-deleted** (`deletedAt`), reversible via restore; their
  slug is preserved and their public page 404s while deleted.
- **A "Deleted" overlay** sits beneath each category grid _in edit mode only_,
  listing the soft-deleted products in that category's subtree with an in-place
  restore. It is a second, admin-only read (`listDeletedProducts`) fired solely
  when edit mode is on; the public read path and its SSR output never see it.
- **Categories are hard-deleted but guarded**: a category with subcategories is
  always blocked (resolve the subtree first); a category with products is
  blocked unless the admin reassigns those products (soft-deleted ones included)
  to another category in the same transaction.
- **Every product has exactly one category, always** — `categoryId` is required
  on create and update; there is no "uncategorised" state.

## Rationale

In-place editing won as the primary model because this catalog _is_ the product:
a single admin (the shop owner) maintaining a few hundred SKUs benefits far more
from "fix it where you see it" than from context-switching into a back-office
that re-presents the same data. The storefront already renders every field
correctly; edit mode reuses those exact views (the product editor's preview
renders through the storefront's own `ProductDetailView`), so there is no second
rendering of the catalog to keep in sync. A pure admin panel would have
duplicated all of that presentation for no gain to a one-person editing team.

Restore is the one operation edit mode cannot reach by the same affordance as
the others: a soft-deleted product is invisible on the storefront, so there is
no tile to click. Rather than exile restore to the admin list, edit mode grows a
dedicated **"Deleted" section** below each category grid — a separate admin-only
query surfaces the subtree's deleted products so they can be restored where they
belong. This keeps the public read pure (a conditional "include deleted if admin"
branch on the public endpoint would make the stable read contract depend on auth
state, and risk leaking deleted rows into the SSR-rendered, crawler-visible,
cached HTML). Because the extra fetch only fires when an admin has edit mode on,
the visitor's render path is byte-for-byte unchanged. The admin list pages still
earn their place for whole-catalog scanning and bulk work, but restore no longer
depends on them.

Aggregating the deleted overlay over the category's descendants (Pattern A, like
the live grid) rather than the exact category was the consistent choice — the
same tree helper backs both — so "what's deleted here" matches "what shows here".
The overlay is unpaginated: a single category's deleted set is small, and paging
it independently of the live grid's server-sliced pages would be awkward for no
real gain.

Soft delete for products is the safe default for a shop where a "removed"
product is usually seasonal or temporarily out of stock, and where past
references (links, the client's memory) should degrade to a clean 404 rather
than a broken edit. Categories, by contrast, are structural and few; a soft
tombstone in the tree would complicate every read query for little benefit, so
they are hard-deleted — but never in a way that can orphan a product, hence the
reassign-or-block guard backed by a `restrict` FK.

Requiring a category on every product is what makes that guard sound: with no
"uncategorised" bucket, the invariant "a product is always reachable through the
tree" holds by construction, and the delete guard has a well-defined job
(reassign _somewhere_) instead of an ambiguous one. Products may attach to any
category, **including a non-leaf parent** — the storefront aggregates a
category's own products with its descendants' (Pattern A), so a product on a
parent simply shows in that parent's grid. This is accepted deliberately rather
than forcing leaf-only assignment, which would be a rule the data model does not
otherwise need.

Browser-local edit-mode state (rather than a persisted user preference) suits a
single admin on a single device and keeps the toggle off the server entirely;
`enabled()` is gated on the admin role and the server enforces every write
regardless, so the toggle is a convenience, never a control boundary.

## Consequences

- (+) One write contract (`admin-catalog.contract.ts`) backs both surfaces;
  storefront read shapes stay untouched and stable.
- (+) The public bundle carries no admin write client — the affordances are
  links plus `@defer`-loaded admin pieces (the delete dialog and the "Deleted"
  overlay), and the extra deleted-products fetch never runs for a visitor.
- (+) Restore lives in edit mode where deletion does, so the storefront is a
  complete edit surface; the admin list is a convenience, not a dependency.
- (+) Removing a product is reversible and its URL degrades cleanly; the tree
  can never orphan a product.
- (+) The "always categorised" invariant is enforced at the contract edge, in
  the service, and by the FK — three layers agree.
- (−) The category grid now issues a second read in edit mode, and keeps the two
  in sync client-side (a reload token re-fetches the overlay after a delete or
  restore) — modest extra coordination the live-only grid did not need.
- (−) Two surfaces to keep coherent as the catalog grows (e.g. a future bulk
  action must decide which surface it belongs to).
- (−) Products on parent categories are allowed, so an admin can create a
  shallow, semantically loose tree; we accept this over enforcing leaf-only
  placement.
- (−) Category delete is a hard delete: no undo, unlike products. Mitigated by
  the confirmation dialog and the subcategory/product guards.
- (−) There is no permanent/hard delete for products, deliberately. A product is
  part of commercial history (past orders, negotiated prices), which this system
  preserves by design, so soft delete is the terminal state. If real friction
  ever justifies a purge — clutter from never-sold test products, or reclaiming a
  soft-deleted product's still-unique `slug`/`sourceId` for reuse — it should be
  a _guarded_ purge restricted to products no order references, mirroring the
  category guard, not a general permanent delete. Whether that guard is even
  required depends on how orders record their line items (a self-contained
  snapshot makes a purge safe; a live FK does not) — a question left to the
  future orders ADR, not settled here.
