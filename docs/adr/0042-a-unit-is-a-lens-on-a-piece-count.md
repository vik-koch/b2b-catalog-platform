# 0042 — A unit is a lens on an integer piece count

**Status:** accepted · **Date:** 2026-08-26

Supersedes ADR 0038's "A line is a product in a unit" and its unit-conversion
rules. Amends ADR 0035's treatment of the minimum in units above the piece.

## Context

ADR 0038 made a unit a **quantity dimension**: a line was a product in a unit,
its quantity counted in that unit, and moving between units was a lossy
conversion the customer had to agree to. Everything awkward about buying in this
shop came out of that one framing.

Two packs of a ten-pack box could not be shown as boxes without becoming a whole
box — twelve pieces the customer did not ask for and would be charged for.
FR-CART-02 therefore grew a confirmation prompt, `ConvertedQuantity.exact`, a
merge-on-collision rule with note-joining, and a page that had to explain all
three. A cart line's identity carried the unit, so the one edit a customer makes
most often changed the key its priced answer was filed under.

Requirements: FR-UNIT-01/03/07/10, FR-CART-02.

Alternatives considered: keeping the conversion prompt and only widening the
input to decimals; storing a fractional quantity on the line; a `sellsLoose` or
`piecesPerBox` flag to mark which products may be split.

## Decision

**Pieces are the quantity. A unit is a lens for reading and entering them.** A
cart line, a wire line and an order line hold one integer piece count; `unit`
decides how that count is displayed and what one press of the stepper moves. A
line of two packs read through a ten-pack box is `0.2 bx` — the same twelve
pieces, said differently.

## Rationale

**Nothing fractional is stored, priced or shipped.** `0.2 bx` _is_ two packs.
`unitQuantity` divides the piece count by the pieces in the unit and rounds the
**reading** to three decimals; `piecesFromUnitQuantity` inverts it, rounding up
to a whole piece, and `correctPieces` then snaps to the lattice — so typing
`0.25 bx` of a 24-piece box buys six pieces and re-renders as `0.25 bx`, and
typing `0.26` buys the next quantity the shop can pick. Every integer invariant
survives untouched: `order_items_total_exact` still names only `pieces`,
`priceMinor` and `priceBasisPieces`, and its integer division keeps its meaning.

**The conversion negotiation is deleted, not improved.** There is nothing to
negotiate: no round-up prompt, no `exact` flag, no merge-on-collision, no joined
notes. `convertUnitQuantity` is gone, and changing unit is a re-render.

**One minimum, one lattice, one lens-independent total.** ADR 0035's amendment
had each unit express the minimum "rounded up to a whole one of that unit",
because a quantity in that unit was itself an integer. It no longer is, so the
rounding goes: `pieceFloor` is the single figure and each unit only reads it out.
`exactLineTotal` likewise stops taking a unit — it is `pieceLotMinor × (pieces ÷
step)` for every line. The pack and box prices remain exactly that expression
multiplied out (the basis divides the pack, so it divides the box), which is why
pricing through them would be a second expression for one figure, disagreeing by
a minor unit the first time a lens showed a fraction. They stay as labels.

**`unit-unavailable` becomes a fallback rather than a refusal.** A product
repacked out of the unit a line was being read in is still perfectly orderable:
the pieces are untouched, so the server moves the lens to the piece and says it
did, instead of nulling the line's total.

**A line is identified by its slug alone**, which the code already assumed and
ADR 0038's stated rule contradicted. With the unit off the identity, a priced
answer is filed under the product, and changing unit no longer blanks the row
while the next call is in flight.

**`order_items.quantity` becomes `numeric(12,3)`** — a display snapshot, so an
order reads back as the quantity that was shown when it was placed even after
the product is repacked. `pieces` stays authoritative and integral, and
`order_items_quantities_positive` relaxes `quantity >= 1` to `quantity > 0`.

**Why now.** v1.5.0 is untagged, so `cartLineSchema` and the order contracts
have never shipped and their shape is still free. `quantity` becomes `pieces` on
the wire; after the tag that would have been a breaking change.

## Consequences

- **The quantity field is a draft, committed when it is left.** Everything else
  works in pieces, so a field bound to the piece count round-trips text →
  pieces → text on every keystroke, and every rounding in that round trip lands
  on the caret: "0,25" backspaced to "0,2" reads back as 0,208, a separator
  typed toward 1,25 is erased as fast as it is pressed, and a figure still being
  typed re-prices the line, the cart and the header behind it. Nothing reads the
  field until `commit()` — which every way out of it goes through, so a draft is
  never abandoned and never committed twice.
- It takes decimals only where a reading can be one — the box, since a piece
  count is a whole number of packs by construction (`unitQuantityIsWhole`). The
  separator is the deployment's, and either is accepted, as `parsePriceInput`
  does.
- Choosing a larger unit on a fresh product page starts at the minimum read
  through it — a six-piece minimum shown in boxes of 24 opens at `0.25 bx`. That
  is the price of the model being honest: the lens never changes what is bought.
- The step is one of the chosen unit (a pack for pieces), and it **snaps rather
  than adds** (`stepFrom`): `+` on a quarter of a box offers a box, not a box and
  a quarter, because a stepper is pressed to reach a figure the unit can say
  plainly. Either way it stays on the lattice; `−` below the minimum lands on the
  minimum first and only offers to remove the line once it is already there.
- A cart line is **priced from the corrected count** (`chargeable`), which
  matters for a line written down before the product's rules changed: pricing it
  as it stands answers "no price", a state that belongs to a product the shop
  cannot price at all rather than to one whose quantity simply moved.
- A corrected quantity is stated in the bubble under the stepper it is about, on
  the cart as on a product page — it is feedback on something already done. The
  advisories that describe a standing state stay as text under the line. The
  bubble has two sources: the controls' own correction, and a `notice` the
  caller passes in; either is dismissed by a click anywhere, and a fresh notice
  reopens it.
- **The correction names no figures** ("The quantity was adjusted to the nearest
  we can supply"). The pair it replaced read out in the selected unit, and in a
  small one that is a pair of thirds — "0.167 adjusted to 1 pk" — which says
  less than the sentence around it. The field beside the bubble already shows
  the figure that stands.
- A cart line's readings are computed from packaging the browser holds, so a
  repackaged product's line re-reads on the next preview.
