# 0058 — Price a product per piece, not per a stored basis

**Status:** accepted · **Date:** 2026-09-11

Supersedes the price-basis half of [ADR 0035](0035-units-of-sale-and-price-basis.md).
Packaging, the minimum and the units of sale are unchanged.

## Context

ADR 0035 gave every product a `priceBasisPieces`: how many pieces its stored
price covers, staff-facing and never serialized. It existed because the source
system was assumed to sometimes quote a price that is exact only per pack — €19.99
for ten pieces, where no piece has a price in whole cents.

The real export settles it: the source system quotes **per unit of measure**, and
the smallest unit is the piece. Nothing in it is priced per lot. The assumption
the basis encoded was wrong, and what it bought — exactness for a price that only
divides evenly across several pieces — was never needed.

Three things made it worth removing rather than leaving in place.

It **spread**. A denominator on `products` reached the price sort (which had to
divide before it could compare, losing the column index), the read contract (two
piece figures, one multiplicable and one for display in thousandths), the order
line (a second column beside `priceMinor`, and a staff screen counting in lot
units rather than pieces), the admin editor (a field, a cross-field rule, and a
check constraint mirroring it) and two refusals — `line-not-priceable` and
`price-unavailable` — that existed only because a basis can fail to divide.

It **could not be owned**. The basis is the denominator of an owned price:
while the catalog is externally owned an admin cannot touch `priceMinor` but
could still change the basis, which re-prices the product just as surely. It is
not in `OWNED_PRODUCT_FIELDS`, deliberately — that list is also what the import
whitelist derives from, so a never-written field in it would poison both. Closing
the hole needed a second notion of frozen-ness; deleting the field closes it.

And it **collided with what comes next**. Moving the base price into
`product_prices` leaves one denominator on `products` shared by every tier's
price row — either a product-level oddity or a column on every price.

## Decision

`products.priceBasisPieces` and `order_items.priceBasisPieces` are removed. A
stored price is the price of **one piece**, and every other unit's price is that
figure multiplied out.

## Rationale

**A piece price divides everything, so exactness stops being a rule to enforce.**
A total is `piece × pieces`, whatever lens the quantity is read through. The
check constraints that made purchasable quantities whole multiples of the basis,
the contract refusals for a line that cannot be priced exactly, and the editor's
cross-field warning all describe a failure that can no longer happen.

**The public contract loses two fields rather than one.** `pieceMilliMinor`
existed because a single piece could not always be priced in cents; it is now
`piece × 1000` and says nothing new. `pieceLotMinor` — what one step costs —
existed so a browser could total a piece line without the basis leaving the
server; it is now `piece × pieceStep`, which the browser can work out from the
packaging it already has. `UnitPrices` is `piece`, `pack`, `box`, all exact whole
minor units, `pack` and `box` null only where the product is not sold that way.

**Staff read an order in pieces.** FR-UNIT-04 had them reading it in basis
units — "10 × 19.99" — because that is how the source system quoted a line. It
quotes per piece, so "100 × 1.99" is the same reconciliation with one less idea
in it. The adjustment screen counts in pieces for the same reason.

**What is genuinely given up** is a price that is exact only per lot. A per-piece
price cannot express €1.999. If the client ever quotes one, the replacement is a
**scaled price** — store the piece price in thousandths, as the display figure
already did — not a basis: it keeps one price per product and one multiplication,
which is what the basis broke.

**Rejected: keeping the column and forbidding anything but 1.** It would leave
every branch, constraint and contract field in place to describe a value that
cannot occur, which is the cost without the capability.

## Consequences

- (+) One price per product, one multiplication for every total, and no quantity
  that cannot be priced. Two contract fields, two error codes, two check
  constraints, one admin field and its validation rule all go.
- (+) The price sort orders on the bare column again, so the price index applies
  — reversing a cost ADR 0035 accepted.
- (+) The ownership hole in ADR 0056 closes without a second notion of a frozen
  field.
- (−) A price that is exact only per lot can no longer be expressed. Accepted on
  the source system's own evidence; the way back is a scaled price, not a basis.
- (−) `products_minimum_fits_packs` survives with a weaker justification. It was
  argued from one lot price having to describe every total; that argument is
  gone, and what remains is that a minimum sitting across the pack puts the first
  orderable quantity off the lattice the stepper walks. Worth revisiting with the
  sale-unit ladder, not now.
- (⚠) The migration re-prices. A product whose price covered several pieces has
  it divided down — which rounds — and is **unpublished**, because a rounded
  price is one a person has to look at and the publication gate (FR-ADM-06) is
  where that review already happens; an unpublished product also announces itself
  in the work queue. The deploy needs no hands, so this is a minor release under
  [ADR 0044](0044-versioning-by-what-a-release-changes.md), with the review named
  in the release notes.
- (⚠) Order lines are history and are not rounded. A past line's price is
  recomputed from the total it was charged at; where that does not divide into
  whole pieces the migration **stops** rather than restating somebody's order.
  No deployment has stored a basis above one, so this cannot fire in practice —
  but the demo seed could produce such lines, and its remedy is a re-seed.
