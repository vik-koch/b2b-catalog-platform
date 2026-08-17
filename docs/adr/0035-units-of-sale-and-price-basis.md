# 0035 — Sell in piece/pack/box, with a staff-only price basis

**Status:** accepted · **Date:** 2026-08-16

## Context

Everything shipped so far assumes a product is bought one at a time: the catalog
returns one `priceMinor`, and `product-sort.ts` orders listings by it. The shop
does not sell that way.

A piece is the smallest sellable item (a 200 g package of beans); a **pack** is
some number of pieces; a **box** is some number of packs. Which units a product
offers varies, and a pack may hold exactly one piece. Some products carry a
**minimum piece quantity** that is also the increment — 140 against a minimum of
100 must become 200.

Two facts break what exists. The legacy price does **not always cover one
piece**: it is most often per pack, occasionally per 100, so a product needs a
_basis_ saying how many pieces its price covers — internal, never shown to a
customer. And a box carries a **volume and weight** a freight buyer needs.

The basis is entered by hand in the admin panel, not carried by the sync, which
means a synced product has a price nobody has validated. That consequence is
taken separately, in ADR 0036.

Alternatives considered: storing packaging in the freetext `products.attributes`
list, as the client first suggested; rounding a per-piece price once and
multiplying it up; deriving the minimum from the pack size in the database; and
CLDR plural forms so the packaging summary could use full unit words.

## Decision

Packaging and the basis are typed columns on `products` (`piecesPerPack`,
`packsPerBox`, `minPieceQty`, `priceBasisPieces`, `boxVolume`, `boxWeight`),
admin-owned; the API never serializes the basis and returns prices already
resolved per unit; purchasable quantities are constrained to whole multiples of
the basis so no total is ever rounded; and packaging is summarised as a formula
("4 pk × 6 pcs = 24 pcs") built from abbreviated unit words.

## Rationale

**Typed columns, not the `attributes` list**, though the values read like
attributes. The basis has to appear in the sort expression, and a jsonb field in
`ORDER BY` gives up the index; "exactly one integer ≥ 1, defaulted" is not
expressible in an array of strings, so `{key: "Pieces per pack", value: "12
pcs"}` is one typo from a wrong price; and an attribute key is admin-editable
display text, so pricing that keys off it breaks when somebody rewords a label.
The client's real requirement — enter and display these like attributes — is met
in presentation: the product page appends them to the same table, and the editor
lays out a typed fieldset styled as that table.

That editor is deliberately not rows _inside_ the attribute grid. The grid is a
single `contenteditable` region, which is what gives it TSV copy/paste, range
delete and drag reorder; typed inputs inside it would be overwritten by a paste,
blanked by the readback, and reorderable into the freetext rows.

**The basis is storage; per-unit prices are the contract** — the same split ADR
0031 makes for tiers, one layer down. It lives on the product, not per tier, so
the import price map needs no change.

**No total is ever rounded, because no total is ever divided.** Rounding can
only enter through the division by the basis, so the basis is required to divide
`minPieceQty` and `piecesPerPack`. Since the minimum is also the increment,
every reachable quantity is a whole number of basis units and a total is plain
multiplication. This is nearly free: the basis is normally the pack size
already, so the constraint promotes a coincidence into a rule.

The alternative — round the per-piece price and multiply up — fails on the
common case. €19.99 per pack of ten is 199.9 minor units a piece; rounded to 200
and multiplied back, the pack costs €20.00. That reprices the shop's own goods
on the unit customers most often buy, and will not reconcile against the system
the price came from.

What cannot be exact is the **informational per-piece price**: €1.999 here, and
a pack of six gives one sixth, which does not terminate in base 10 at any
precision. It is shown to three decimals, as comparable B2B catalogues do, and
is a comparison figure only — no total is derived from it.

**Sorting follows the basis**, as 0031's rationale 5 required it to follow tier
resolution: raw prices are not comparable between products, so ordering on the
bare column would put a €50-per-100-pieces product above a €10-per-piece one.

**Unit words are abbreviations**, which removes the plural problem rather than
solving it. A pack may hold one piece, so full words would need inflection the
app has no machinery for; an abbreviation reads the same after any quantity, and
suits a wholesale catalogue anyway.

## Consequences

- (+) Sellable units, minimums and the basis are typed, constrained data both
  the API and the browser compute from.
- (+) A pack or box price is exactly the price the source system holds, so the
  shop's numbers reconcile.
- (+) The import contract needs no change, so 0026's stability promise holds.
- (+) Every column is nullable or defaulted: products without packaging behave
  as before and nothing has to be backfilled.
- (−) The price sort stops using the column index wherever a basis exceeds 1. A
  few hundred rows, so accepted; a generated per-piece column is the way out.
- (−) The per-piece price is shown at a precision the currency lacks (€1.999),
  and does not multiply out to the total.
- (−) `minPieceQty` and `piecesPerPack` must be multiples of the basis, so staff
  meet a validation error naming a field they were not thinking about.
- (−) Packaging is admin-entered, so a large catalog is a lot of manual work
  until the sync can carry it. Moving it to the sync later is a change of
  ownership under 0022 — the first run that writes these is the first run that
  overwrites admin corrections.
- (−) A deployment's unit wording is constrained to abbreviations; a full
  inflecting word produces wrong grammar and nothing validates it.
- (⚠) Nothing may compute a total by multiplying the serialized per-piece price.
- (⚠) A basis edited so it no longer divides an existing quantity must be
  refused, or the exactness guarantee lapses on that product.
