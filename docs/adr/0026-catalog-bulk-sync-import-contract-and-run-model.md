# 0026 — Define a stable sync row contract with per-run intent, applied through a staged preview

**Status:** accepted · **Date:** 2026-07-30

## Context

FR-ADM-02 asks for a bulk sync that upserts products from a file the client
exports periodically and removes products missing from it. ADR 0022 already
fixed the storage side — file-owned fields versus admin overlay, `products.sourceId`
and `categories.sourceId` as private upsert keys, soft delete rather than delete —
and put a client-specific converter in front of the backend so the raw export's
shape stays the converter's problem. What is still undecided is the format the
backend consumes, how a run declares what it is allowed to change, and how the
required diff preview and audit trail work.

Four properties of the real source constrain the answer:

- The export is a **complete catalog** with all fields, produced periodically.
  It is not an incremental extract.
- Its **category column is the leaf name only** — no id, no parent path (ADR 0022).
  (Superseded by the 2026-08-03 amendment below: the export does carry a category id.)
  Category names are currently unique across the whole catalog.
- Top-level categories **do not exist in the file at all**; the tree's upper levels
  are created by hand in the admin UI (FR-ADM-01).
- The client is migrating to newer source software, so the export's structure is
  expected to change — plausibly gaining real category ids and parent categories.

Iteration 2 stores one price per product; FR-AUTH-05 introduces tier → price-list
resolution in iteration 4, so the import shape must absorb multiple price lists
without a breaking change..

Alternatives considered: a bespoke CSV parser with positional columns; a
stateless "validate" endpoint that re-parses on commit; a dedicated singleton
row to hold the last-sync timestamp; and letting the sync manage categories
symmetrically with products.

## Decision

- **The Zod row schema is the contract; CSV and JSON are two encodings of it.**
  One parser per encoding feeds one validator and one engine. CSV serves the manual
  admin upload (the client can read and fix it in a spreadsheet): UTF-8 with an
  optional BOM, `,` separator, RFC-4180 quoting, a **required, order-independent
  header row**, decimal point `.`; a wrong or missing header rejects the whole file
  rather than being guessed at. JSON (`{ rows: [...] }`) serves the later headless
  path.
- **A row is `sourceId` plus optional fields.** `sourceId` is the upsert key.
  Prices are a **map** from day one — `prices: Record<PriceListKey, minorUnits>`,
  CSV headers `price:<key>`, with a bare `price` accepted as an alias for
  `price:default`. Iteration 2 knows only the key `default`; tier keys are added
  later as a semver-minor enum extension. _(Superseded by ADR 0031: the key is a
  plain string validated against `customer_tiers` at run time, not an enum —
  tier keys are deployment data, so the contract never has to change again.)_
  **Only keys present in the payload are
  written**; an absent key is left untouched, never cleared. A price is an
  **integer in the currency's minor unit**, as in the read contract and storage;
  a decimal in the file is a row error, not a rounding.
- **Each run declares its intent, and writes nothing outside it:** a `fields`
  whitelist for non-price fields, `createMissing`, `updateExisting`,
  `restoreReturning`, `createCategories`, and `softDeleteMissingProducts`.
- **Deletion requires authority over the product set.** `softDeleteMissingProducts`
  is only accepted together with an explicit `productSetAuthoritative: true` —
  "this file is the complete catalog" — and the combination is refused otherwise.
  Products whose `sourceId` carries the `manual:` prefix are excluded from the
  sweep and reported as a separate "kept" group in the preview.
- **Categories are never deleted by a sync.** The engine creates and updates them
  and stops there. Leaf categories that a run empties are reported in the preview
  so an admin can remove them by hand.
- **`categories.sourceId` holds the normalized leaf name** (trimmed, whitespace-collapsed,
  casefolded) until the source provides a real id. New leaf categories are created
  **unparented** — as roots — and a later run never re-parents them.
- **Preview is a staged run.** `POST /admin/sync/preview` parses, validates, diffs
  against the database, **persists the parsed rows and options**, and returns a
  summary, the per-entity changes, and per-row errors. `POST /admin/sync/commit`
  re-diffs from the stored rows and applies everything in **one transaction**,
  returning the counts actually applied; drift since the preview is reported, not
  blocked. The headless path is the same engine with both halves inlined.
- **A `sync_runs` table is both the audit log and the last-sync source of truth** —
  actor, source, filename, options, status, counts, error, and the staged rows
  (pruned after commit). "Last sync" is its newest row.

## Rationale

1. **Separating the row schema from the encoding is what keeps the two entry points
   honest.** The manual upload and the future headless script must not drift into
   two subtly different importers; making CSV and JSON both decode into one
   validated row type means the diff, the write path, and every rule below are
   written once. CSV alone would have been simpler but is a poor fit for a machine
   caller; JSON alone would have taken the spreadsheet away from the client, which
   is their only tool for inspecting and correcting the file.
2. **Prices as a map now costs nothing and prevents a breaking change later.**
   A map with a single known key today is the same data, and per-tier files, one
   combined file, or a partial price update are all the same code path. Writing
   only the keys present is what makes a per-tier file safe:
   it cannot blank the lists it does not mention. Minor units rather than
   decimals keep the API currency-agnostic: it holds no ISO code, locale or
   minor-unit exponent — those are deployment config, consumed by the web — so
   scaling "18.90" would mean inventing a second, divergent source of currency
   truth on the server. The converter already knows the currency, which is
   exactly the kind of thing ADR 0022 put it there to absorb. The cost is a
   less friendly spreadsheet (`1890`, not `18,90`); the diff preview renders
   formatted prices, so the human check happens where the currency is known.
3. **Tying deletion to authority over the product set, not to a field set,
   survives a format change.** The earlier formulation — "delete only on a
   full-field run" — is a proxy that breaks as soon as a price file happens to
   cover every product. Authority is a claim about the file's completeness, which
   is exactly the precondition deletion needs, and it is stated by the caller
   rather than inferred. Excluding `manual:` products from the sweep is the
   corollary: those exist precisely because the catalog is usable standalone (demo
   deployments, and anyone running this software without a legacy source), so they
   are absent from every real export by construction and a sweep would erase them.
4. **The product/category asymmetry is forced by the source, not chosen.** Every
   top-level category is missing from every file, so a symmetric delete-missing
   sweep would destroy the manually built tree on its first run. Reporting emptied
   leaves and leaving removal to FR-ADM-01 costs an occasional manual cleanup and
   removes an entire class of catastrophic run.
5. **Name-keyed categories are the honest status quo, with a cheap exit.** The
   source offers nothing else today. Feeding the normalized name into the
   `sourceId` column that already exists means the eventual real id is a one-time
   backfill and a converter change — no schema or engine reshape. Names being
   currently unique is what makes this safe; if the new source software ever
   allows duplicate leaf names under different parents, the converter must
   disambiguate before the backend sees them.
6. **Staging the parsed rows makes commit cheap and the preview trustworthy.**
   A stateless validate endpoint would force a re-upload and re-parse, and would
   invite the two passes to disagree. Re-diffing at commit against stored rows
   keeps the preview advisory — the database may legitimately have moved — while
   the single transaction keeps a partially applied catalog impossible.
7. **A `sync_runs` table subsumes the last-sync date.** The requirement is already
   for an audit-logged sync, so a separate singleton would add a second write path
   to keep consistent and would answer "when" without "by whom, from what file,
   changing what". The newest row answers all of it.

## Consequences

- (+) Iteration 4's tier pricing, and future stock updates, extend the
  contract additively: a new price-list key, a new field in the whitelist.
- (+) The dangerous operation has exactly one gate, stated per run and visible in
  the preview and the audit log, rather than being implied by the file's contents.
- (+) The admin UI can present two presets over the flags — "complete catalog
  export" and "price update" — so the safe combination is the default one.
- (−) A category renamed in the source reads as a delete plus a create: the old
  category survives but empties, a new unparented one appears, and an admin
  reparents the new one and removes the old. This is the price of name-keying and
  the strongest argument for adopting a source-side category id when the new
  software offers one.
- (−) Every run's new leaf categories need manual parenting before their products
  are reachable through the storefront tree. The preview flags them, but the sync
  is not fully unattended until the source carries parents.
- (−) ADR 0022 lists category hierarchy as file-owned. With today's leaf-flattened
  export that is provisionally untrue — parent assignment is admin-owned, and a
  sync never overwrites it. This is recorded as status quo rather than an
  amendment to 0022: if the client's new source software emits parent categories,
  hierarchy returns to file-owned and this decision's category rules are revisited
  as a unit.
- (−) Staged rows are catalog-sized blobs in the database until pruned; retention
  (last N runs, 30 days) is a maintenance concern the prune job must own.
- (⚠) The headless entry point is specified here but **not built in this
  iteration**: it needs a non-cookie credential, since the session JWT is
  browser-shaped and rotates with `tokenVersion`. API tokens are deferred to the
  stock/frequent-sync work (iteration 7 or later) and will carry their own ADR.

## Amendment — 2026-08-03: categories are keyed by a source id

The export turned out to carry a category id after all, which is the "cheap exit"
rationale 5 above reserved. Taken:

- A row carries **`categorySourceId` + `categoryName`**, replacing the single
  `category` column. Identity is the id; the name is content.
- **Both or neither.** Half a pair cannot create a category (no name) or say
  which one it renames (no id), so a row carrying one is a row error.
- **One id, one name per file.** Two rows giving the same `categorySourceId`
  different names contradict each other; the later row is a row error rather
  than a coin flip. Case and spacing differences are normalized away first.
- **A renamed category is updated in place**, keeping its slug, its parent and
  its overlay fields — the delete-plus-create consequence recorded above is gone.
  A sync still never deletes a category.
- Two categories may now legitimately share a **name**, since the name is no
  longer the key. `categories.sourceId` holding a normalized name applies only
  to rows imported before this amendment and to admin-created categories.

Unchanged: new categories are still created unparented, the export still carries
no hierarchy, and parent assignment stays admin-owned.
