# 0022 — Model the catalog with file-owned fields plus an admin overlay, decoupled from both the import format and the read API

**Status:** accepted · **Date:** 2026-07-28

## Context

The catalog (FR-CAT-01…05) is populated from a periodic file the client
exports (FR-ADM-02), not typed into the app. That source has three awkward
properties: it carries no public article number (SKU), its category column is
**flattened to the leaf** (no parent path), and it contains none of the
presentation content — descriptions, characteristics, or images. Its exact
format is also not yet known.

Two futures have to stay cheap: (a) the export later carries _everything_
(descriptions, attributes, images too), or (b) the shop switches to a live
external API and nothing is persisted in our Postgres at all (both far past
iteration 6). And the read API for the storefront already exists and is stable.

The decision is how to model storage so the unknown import format, the known
read contract, and these futures don't entangle.

## Decision

- **Three independent boundaries.** The **import contract** (file → DB, a Zod
  DTO, built with FR-ADM), the **read contract** (DB → web, ts-rest, already
  shipped), and **storage** (Postgres, reached only through `CatalogService`).
  A client-specific **Python converter** turns the raw export into the import
  format, so the backend only ever consumes the stable format — the file's shape
  is the converter's problem, not ours (the ports-and-adapters seam again).
- **Every field is either file-owned or admin overlay.** File-owned: product
  `name`, `priceMinor`, category; category `name` and hierarchy. Admin overlay
  (edited in-app, **untouched by a re-sync**): product `descriptionHtml`,
  `attributes`, images; category `image`, `sortOrder`, `description`.
- **Private sync keys, never serialized.** `products.sourceId` (the legacy
  internal id) and `categories.sourceId` are the upsert identities and stay
  server-side; the only public handle is the `slug`, generated once and kept
  stable across name changes (a changed URL breaks links/SEO). Response
  validation (`validateResponses`) enforces this at the edge.
- **Soft delete, not delete.** A product missing from the source is marked
  `deletedAt` and excluded from reads, never removed.
- **Images are an ordered `{ full, thumb }` list on the product row** (jsonb),
  not a side table — no per-image metadata is needed (the UI uses the product
  name as alt). Category images are a single `{ full, thumb }`. Both variants are
  independently content-addressed in the media store (0021); `thumb` keeps
  grid/list/search light, `full` is the product page.
- **The tree is derived and shaped in memory.** Categories are a small adjacency
  list; `CatalogService` fetches them whole and builds the tree, descendants,
  ancestors and subcategory links in pure functions rather than recursive SQL.

## Rationale

1. **The overlay split is what makes future (a) additive.** Because the overlay
   columns already exist, "the export now carries descriptions too" is just the
   import writing more columns — a backwards-compatible, semver-minor change, no
   reshape. Until then, admin edits are never clobbered by a sync.
2. **The read/storage seam is what makes future (b) a swap.** The storefront
   talks to a `CatalogService`; pointing it at an external-API adapter instead
   of Postgres changes no call site and no frontend code, because the read
   contract never exposed storage.
3. **Deriving the tree in the app beats recursive SQL here.** A few dozen
   categories fit in memory; pure functions are trivially unit-testable and
   avoid CTEs for a structure this small. This would flip if categories grew
   into the thousands.
4. **Explicit `{ full, thumb }` beats a naming convention.** Deriving the thumb
   URL from the full by suffix would force the thumb to be named after the full's
   hash (breaking the media store's content-addressing, 0021) and spread that
   convention across the store, the prune sweep, and the read layer. Two stored
   URLs keep each file independently addressed and need no convention anywhere —
   the DB cost is one jsonb column.
5. **The converter absorbs the unknown.** Building against a stable import format
   now, with the file→format mapping isolated in a script, means an unknown or
   changing export costs one adapter, never a schema or API change.

## Consequences

- (+) Catalog display (FR-CAT) is fully DB-backed with no dependency on the
  import existing yet; the demo is populated by a direct seed.
- (+) Both futures move exactly one boundary (import DTO gains optional fields;
  or the read adapter changes) with no frontend impact.
- (+) Private ids cannot leak: they are columns the contract never names, and
  response validation fails loudly if that ever regresses.
- (−) The parent-category _tree_ cannot be reconstructed from a leaf-flattened
  export automatically; parents are created/arranged in the admin UI (FR-ADM).
  The demo seed sidesteps this by authoring the tree directly.
- (−) Overlay content is deployment-local data (not in the export), so it must
  be part of the deployment's backup story until/unless future (a) lands.
- (⚠) `products.images` and `categories.image` hold `/media` URLs, so they are
  registered in the media-prune reference scan (0021); a new media-bearing
  column MUST be added there in the same change or the sweep deletes live files.
