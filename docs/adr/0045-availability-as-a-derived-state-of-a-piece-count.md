# 0045 — Derive availability from a stock piece count, and sort by it everywhere

**Status:** accepted · **Date:** 2026-09-03

## Context

The shop's source system knows how many pieces of a product it holds, and that
figure is reliable. The client wants customers to see whether a product can be
had — not how much of it is left, which is a trade term. Requirements:
FR-STOCK-01…05, FR-ADM-02/05, FR-SEARCH-04, FR-CART-02.

Three things had to be decided: what crosses the wire, where the "few left"
line sits for a product whose packaging does not define a box, and what
availability does to the order of a listing.

Alternatives considered: sending the count and thresholding in the browser;
computing the state in a `CASE` at query time; offering availability as a sort
option beside name and price.

## Decision

- **The count is staff-facing; the state is public.** `stockPieces` is written
  by the bulk sync and by the admin form, and never leaves the API except to
  staff. The storefront read model carries `availability` — `out` | `low` |
  `in` — and nothing else.
- **The state is stored, not computed per query.** A product's `availability`
  column is recomputed whenever its stock, threshold or packaging changes, and
  indexed.
- **One nullable override, one resolved threshold.** "Few left" is at or below
  the pieces in one box, falling back to one pack, then to a deployment-wide
  piece count. A product may override the figure with `lowStockThresholdPieces`.
- **Availability leads every sort.** Out of stock sorts last under name, price
  and relevance alike; no availability sort control is offered. A deployment can
  hide the sort controls entirely (`catalog.sortControlsEnabled`), which removes
  the picker and changes no ordering.
- **Out of stock blocks the purchase, few left blocks nothing.** Adding is
  refused in the browser and at checkout, by contract code. A customer may order
  ten boxes of a product with one left; the manager reviews it, as they review
  every order.

## Rationale

**A count in the browser is a count published.** Thresholding client-side would
put the exact stock of every product in a listing payload, which is the one
thing the client asked not to show; the same discipline already keeps `sourceId`
out (ADR 0022).

**A stored state is what makes the ordering cheap.** The threshold depends on
packaging and on a per-product override, so the `CASE` that computes it is not
sargable and would sit in the `ORDER BY` of every listing, every search and
every facet count. Recomputing on write is a handful of call sites — sync,
product save — and buys an indexed leading sort term. It is the shape the
derived attribute values already use (ADR 0037).

**Negative is a value, not an error.** A stocktake correction can leave the
figure below zero; nothing rejects it, and `<= 0` reads as out of stock, so the
correction needs no cleanup pass before the catalog is right again.

**An availability sort control would be redundant and slightly wrong.** Once out
of stock sorts last under every sort, "sort by availability" only reorders what
is already grouped. Leaving it out also means the one deployment that hides the
sort controls loses nothing: the ordering customers actually need is not a
control at all.

**The sync writes stock the way it writes prices.** FR-ADM-02 gains a per-run
statement of which fields a run writes, so a price-only export cannot blank a
stock figure and a stock-only export cannot blank a price. Admin edits are not
protected from a later run — they are the correction between runs, which is what
the client already does with prices.

## Consequences

- (+) One integer column and one nullable override carry the whole feature; there
  is no per-product rule object and no rule engine.
- (+) The badge is one more thing the shared buying-control widget renders, so
  tile, row, product page and cart line get it at once.
- (−) A stale `availability` column is possible if a write path forgets to
  recompute. Packaging edits are the easy one to miss, since they move the
  threshold without touching the stock.
- (−) Two products with the same stock can show different states, because the
  threshold follows the box. That is intended — a box of 24 and a box of 1000
  do not mean the same thing by "few" — but it will be asked about.
- (−) A cart that sat for weeks can hold a line that has gone out of stock. It
  is reported through the machinery FR-CART-10 already has, and refused at
  checkout; nothing is silently dropped.
