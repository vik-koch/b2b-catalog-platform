# 0035 — Sell in piece/pack/box, with a staff-only price basis

**Status:** accepted (amended 2026-08-18, 2026-08-23) · **Date:** 2026-08-16

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

## Amendment — 2026-08-18: a box count, and the attribute table keeps only box facts

Client review of v1.3.0 returned two corrections.

**A product may ship as more than one box** (`boxCount`, default 1). The stored
`boxVolume`/`boxWeight` are the **totals across those boxes**, not per-box
figures, which is why neither is ever multiplied by the count, and why the count
touches no price, piece count or quantity rule. The alternative reading, in which
a box unit contains `boxCount` cartons' worth, was considered and rejected by the
client's own answer: the figure exists so a freight buyer knows how many cartons
arrive, not to redefine what a box is.

The count is **not a row of its own** in the attribute table. On its own it
answers a question nobody asked at that point in the page; what a reader of a
volume needs to know is _what that volume covers_, so it qualifies the labels
instead — "Box volume (for 2)" — and only where it exceeds one. Its real
consumer is the cart, where the counts, weights and volumes of the ordered lines
are added up into a summary of what will physically arrive.

**The customer-facing attribute table keeps only the box facts** — the volume
and the weight. The packaging summary and the minimum piece quantity come out
of it. The summary moves to the control that chooses a unit to buy in, where
the counts in "Pack (6 pcs)" are what make a per-pack price interpretable;
the minimum becomes the quantity field's hint, because it is a constraint on an
input rather than a fact about the product, and because it applies to piece
purchases only — a static row is wrong whenever a pack or box is selected. Until
the cart exists neither is on the product page.

**Product tiles are unaffected**: they keep both, and the deliberately redundant
minimum that keeps every packaged tile the same height.

## Amendment — 2026-08-23: an exact piece lot, and where the formula and the minimum landed

Two additions the cart forced (ADR 0038).

**`pieceLotMinor` joins the per-unit prices** — the exact integer price of
`minPieceQty` pieces. It exists because the browser now computes totals, and the
piece unit was the only one it could not compute exactly: `pack` and `box` were
already integers, and `pieceMilliMinor` is the deliberately-inexact comparison
figure. The database guarantees the basis divides `minPieceQty`, and
`correctPieceQuantity` guarantees every purchasable piece quantity is a whole
multiple of the minimum, so one minimum lot has an exact price and every piece
total is `pieceLotMinor × (quantity ÷ minPieceQty)` — plain multiplication, no
division, no rounding.

This does not weaken "the basis is storage, per-unit prices are the contract"; it
applies that rule to the one unit where the contract had so far offered only a
display figure. Nothing leaks: `pieceLotMinor` is `priceMinor × (minPieceQty ÷
basis)`, and no combination of the public figures separates `priceMinor` from the
basis. The e2e assertions that the basis never appears in a response stay green
unchanged, which is the check that this respects the rule rather than bending it.

The (⚠) above is unchanged and now matters more, not less: `pieceMilliMinor`
exists only to be formatted, `pieceLotMinor` is the multiplicable one, and every
total on either side goes through the one shared helper — `exactLineTotal()`,
the client-safe sibling of `totalMinor()`.

**The packaging formula and the minimum land on the buying block**, closing the
loop the 2026-08-18 amendment opened when it took them out of the attribute
table with nowhere yet to put them. The formula becomes the unit selector's
labels — "Pack (6 pcs)", "Box (24 pcs)" — because a per-unit price is
uninterpretable without the count and that is where the unit is chosen. The
minimum becomes the quantity field's hint, with the correction message beside it
when `correctPieceQuantity` fires, because it is a rule on an input rather than a
fact about the product, and because it applies to piece purchases only. Tiles are
still unaffected: they keep both.

**The shipment summary extends to piece and pack lines**, derived from the same
box figures through the packaging ratios (FR-UNIT-11 amended). The invariant
above is untouched: `boxVolume` and `boxWeight` are still totals across
`boxCount` cartons and are still never multiplied by it. What changes is that a
partial box now has a stated figure — proportional for weight and volume, rounded
up to whole cartons for the count, and labelled approximate. ADR 0038 pins the
arithmetic.

## Amendment — 2026-08-26: the minimum is a floor, the pack is the increment

`minPieceQty` carried two jobs — the smallest order and the increment — and they
are not the same fact. The minimum is commercial: how little the shop will
bother picking and shipping. The increment is physical: a pack is what cannot be
broken open. Fusing them meant a shop that will not ship fewer than 24 also
refused to sell 30, and pushed the client's own example of 140 against a minimum
of 100 all the way to 200. That was never a rule anybody stated; it fell out of
using one column for both.

**The step is `piecesPerPack`, falling back to `minPieceQty` where a product has
no pack** — a product with nothing to stop it moving by ones has only its own
minimum to go by. `pieceStep` and `pieceFloor` in `product-units.ts` name the two
figures, and every surface reads them rather than the column.

**The minimum must be a whole number of packs**, enforced by
`products_minimum_is_whole_packs` and mirrored in the editor. This is what keeps
one published price able to describe every piece total: with the minimum on the
step lattice, every orderable quantity is a multiple of the step, so a total is
`pieceLotMinor × (quantity ÷ step)` — still plain multiplication, still nothing
divided and nothing rounded. A minimum of 25 against a pack of 6 would put the
first orderable quantity off the lattice and cost a second published figure to
describe. The migration raises any existing minimum to the next whole pack, which
is the direction FR-UNIT-03 already corrects in.

**`pieceLotMinor` is now the price of one step, not of the minimum.** The
2026-08-23 amendment defined it as `priceMinor × (minPieceQty ÷ basis)`; it is
now `priceMinor × (pieceStep ÷ basis)`. The exactness argument is unchanged and
the (⚠) rules above still stand — only which quantity the lot describes moved,
and it moved to the one every total is actually a multiple of.

**The minimum holds in every unit, not only in pieces.** It was applied to piece
purchases alone, on the reasoning that "a pack or a box is already a valid
quantity" — but that made the rule bypassable by changing the word: one pack of
six is six pieces, which is under a minimum of 24. It is one figure, stored in
pieces, and each unit expresses that same figure — 24 pieces is four packs of
six, or one box of 24 — rounded up to a whole one of that unit, since half a
pack is not something the shop picks. `unitFloor` and `correctQuantity` replace
the piece-only `pieceFloor`/`correctPieceQuantity`, and the server corrects every
unit rather than only pieces.

The minimum shown beside the stepper follows the selected unit for the same
reason: a stepper that stops at four packs cannot be explained in pieces. A tile
still states it in pieces, as a plain fact about the product.

The correction message follows the same split. It fires where a typed quantity
is not whole steps, where it is under the unit's floor, and where a **change of
unit** had to round up — two packs are half a box, and half a box is not
something the shop packs. It names the unit it corrected, so a rounded box is
never reported in pieces.

Not addressed here, and written down so it is not mistaken for settled: `piece`
still fuses the priced unit, the smallest sellable unit and the physical content
descriptor. Products exist where those diverge — a litre of milk with no middle
rung, a paper roll that is a pack physically and an atom commercially, a
200-filter pack sold and priced whole. The likely answer is a variable-length
ladder of named sale units rather than three fixed columns, and it is parked
pending a survey of the real catalog rather than designed from examples.
