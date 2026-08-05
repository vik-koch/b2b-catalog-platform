# 0031 — Customer tiers are database rows; a product's non-default prices live in a side table

**Status:** accepted · **Date:** 2026-08-04

## Context

FR-AUTH-05 requires prices to resolve through a customer tier: an account is
assigned a tier when it is approved (FR-AUTH-01), and the price it sees comes
from that tier's price list. Anyone without one — guests, crawlers, staff
accounts — sees the default list.

Tiers are **not a scale**. They are distinct kinds of customer — retail,
wholesale, and whatever else a deployment sells to — so no tier is "above"
another, none inherits from another, and "the cheapest tier" is not a meaningful
question. The requirement's phrase "lowest-tier (default) price list" names one
designated list, not a position in an order.

Everything shipped so far assumed one price. `products.priceMinor` is a single
`integer` column; the read contract (`catalog.contract.ts`) returns one
`priceMinor` and says so explicitly ("tier-based price lists are FR-AUTH-05");
`product-sort.ts` sorts on that column. The one place already built for the
future is the import contract (0026), where prices are a
`Record<priceListKey, priceMinor>` map rather than a scalar — precisely so tier
lists could be added without a contract break.

That map left one question open, and it is the real decision here: **what is a
price-list key?** `sync.contract.ts` currently declares
`SYNC_PRICE_LIST_KEYS = ['default']` as a Zod enum, with a comment planning to
append tier keys to it in this iteration. Doing that would put each deployment's
tier names — which are client business vocabulary — into the public repo, and
would make "the client added a tier" a code change and a release.

The second open question is how a tier's prices are stored: widen `products`
with a column per tier, or a side table. And whichever way that goes, the single
`priceMinor` column no longer describes itself once it is one price among
several.

## Decision

- **Tiers are rows, not an enum.** A `customer_tiers` table
  (`id`, `key`, `label`, timestamps). `key` is the stable machine identifier
  used by the import; `label` is what staff see. Every deployment defines its
  own tiers; the public repo ships only the demo's.
- **The set is flat, and the default tier is not in it.** There is no rank or
  ordering column, because there is no order to record. Nor is there a default
  flag: `customer_tiers` holds only the _additional_ tiers, and the default list
  is `products.defaultPriceMinor` itself. `key` may not be `default` (a check
  constraint), since that name addresses the base list rather than any row.
- **The existing price column stays, renamed to `products.defaultPriceMinor`.**
  It is not migrated away: it holds the default tier's price. A new
  `product_prices` table (`productId`, `tierId`, `priceMinor`, composite primary
  key) holds prices for the additional tiers only. It cascades from the product — a
  deleted product's prices are meaningless — but **restricts** from the tier,
  because dropping a tier would silently re-price every product that overrode
  it. `users.tierId` restricts for the same reason.
- **Resolution has exactly two cases.** A request whose session carries a
  `tierId` resolves through `product_prices`, falling back to
  `products.defaultPriceMinor` where that tier has no row for the product; every
  other request reads `products.defaultPriceMinor` directly, with no join. A null
  `tierId` is a normal, permanent state meaning the default list — what staff
  and any customer not placed in a specific tier get — not a placeholder for an
  unfinished approval.
- **The read contract does not change.** The API still returns a single
  `priceMinor` per product, resolved server-side. The client never learns that
  tiers exist, and no price list other than its own is ever serialized. The
  differing names are the point: `defaultPriceMinor` is **storage**, one tier's
  price among several; `priceMinor` is the **contract**, the one price this
  caller gets. Only the read layer knows how to turn one into the other.
- **The import price key becomes a plain string, validated semantically.**
  `SYNC_PRICE_LIST_KEYS` and its Zod enum are removed; `sync.contract.ts` accepts
  any key shape and the sync validator rejects keys that do not match a
  `customer_tiers.key`, reporting the valid ones — the same treatment
  `categorySourceId` already gets. `price` without a suffix stays an alias for
  the default tier.
- **SSR stays session-blind.** Server-rendered HTML carries default-tier prices;
  a signed-in customer's own prices arrive on the client refresh that
  `AuthService` already performs. Responses that carry a resolved non-default
  price are marked `Cache-Control: private`.

## Rationale

1. **Rows over an enum is the client-specifics rule applied to data.** Tier
   names are the client's commercial vocabulary. As an enum they would live in
   `libs/shared`, i.e. in the public portfolio repo, and adding a tier would mean
   a PR, a release and a redeploy. As rows they are deployment data, managed by
   an admin, and the import contract becomes final — which is the stronger
   promise, since 0026 committed to keeping that contract stable.
2. **Keeping the column keeps the common path free.** Guests and crawlers are
   the overwhelming majority of catalog traffic, and they all want the default
   list. Migrating every price into `product_prices` would put a join and a
   fallback on that path to serve a minority. It also means the existing sync
   applier, the search query, sorting, and every current test keep working
   untouched; the side table is purely additive.
3. **A side table over a column per tier**, because a tier is data: a column per
   tier makes creating one a migration, which contradicts decision 1 outright.
4. **The fallback is a feature, not a compromise.** A source export will
   routinely price only some products in some lists. Falling back to the default
   price is the commercially safe behaviour (a customer is never shown "no
   price"), and it means a tier only has to carry its _exceptions_.
5. **Sorting must follow resolution.** Sorting a tiered customer's listing on
   `products.defaultPriceMinor` would order the page by prices that customer
   cannot see. `product-sort.ts` therefore sorts on the resolved expression,
   which for the default path is still the bare column and still uses its index.
6. **Renaming the column is worth one mechanical migration.** Left as
   `priceMinor`, the column would silently mean "the default tier's price" while
   reading like "the price" — and it would be indistinguishable by name from the
   contract field, which genuinely is "the price". A `RENAME COLUMN` preserves
   the data, and the blast radius is the handful of call sites that name the
   column plus the raw-SQL seed.
7. **No rank, because the order would be fiction.** An unused ordering column is
   not harmless: it invites code to ask "the next tier up" and an admin UI to
   draw a ladder, neither of which means anything here.
8. **The default tier is a column, not a row — so it cannot be wrong.** Modelled
   as data (a flagged row), a deployment could end up with two defaults or none,
   the row would need a guard against deletion, and "which list is public"
   becomes a query. As `products.defaultPriceMinor` it exists exactly once, by
   construction, and no product can lack a base price. The cost is that the
   default is not addressable by id: the admin UI must present it as a
   synthetic entry beside the real rows, labelled from the deployment's text
   config — which is also what makes that label translatable per deployment,
   where a database `label` would not be.
9. **Session-blind SSR keeps NFR-SEO-01 true and caching sane.** Crawlers must
   see real content, and default prices are the right thing for them to index.
   Resolving during SSR would add a per-tier dimension to every cacheable
   storefront response for a benefit — no price flicker for signed-in customers —
   that a small number of users would notice on one paint.

Concessions: the two price locations are asymmetric — a column for the base
list, rows for the rest — so any code that writes a price must know which it is
addressing, and the default tier is the one thing in the pricing UI that has no
database id.

Tiers are sorted by `customer_tiers.sortOrder`, set by drag-and-drop in the
admin tier list and applied wherever staff see tiers — the list itself and the
per-tier price fields in the product editor — so the tier a deployment works
with most sits first instead of wherever the alphabet puts it.

## Consequences

- (+) A deployment adds or renames a tier through the admin panel; no code, no
  release. Adding one never disturbs the others, because none of them relate.
- (+) The FR-ADM-02 import contract needs no further change for pricing, ever.
- (+) Guest, crawler and staff traffic executes exactly the query it does today.
- (+) No tier's prices can leak to another tier: only the resolved scalar is
  serialized, and response validation already forbids unnamed fields.
- (−) Two places now hold prices; any code that writes a price must know which.
  Writes go through one service method to keep that in one place.
- (−) The rename touches every call site naming the column, including the raw
  SQL in `libs/seed`, and a database that had the migration applied by hand
  outside Drizzle's ledger will fail on the next run.
- (−) Deleting a tier is refused while users or `product_prices` rows reference
  it — by the foreign keys themselves, not only by a service check; re-tiering
  those users and clearing those prices is a deliberate admin step.
- (−) Price-bearing responses for tiered customers are uncacheable by shared
  caches.
- (−) The default tier has no row, so anything that enumerates tiers for display
  — the admin tier list, the per-tier price editor, a user's tier picker — must
  prepend a synthetic entry. Its label comes from the deployment's text config.
- (⚠) A user's tier is `users.tierId`, which is **nullable by design**. Code
  that treats null as "not yet set" and prompts staff to fix it will nag about
  every default-list customer forever.
- (⚠) `default` is a reserved price-list key, enforced by a check constraint. A
  deployment cannot name an additional tier `default`, because that key already
  addresses the base list in the import.
