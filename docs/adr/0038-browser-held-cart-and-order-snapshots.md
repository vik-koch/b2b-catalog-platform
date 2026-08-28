# 0038 — Hold the cart in the browser, and store an order as a self-contained snapshot

**Status:** accepted (partly superseded by 0042) · **Date:** 2026-08-23

## Context

Everything shipped so far lets a visitor find a product and see what it costs.
Nothing lets them ask to buy it. This decision covers the cart and the records an
order leaves behind; the checkout form itself is ADR 0039.

Requirements: FR-CART-01/02/08/10, FR-UNIT-07/11, FR-ACC-01, FR-NOTIF-05/06.

Four constraints shape it. The shop sells in **piece, pack or box**, with a
staff-only price basis and a minimum piece quantity that is also the increment
(ADR 0035), so a cart line is not a product plus a number. Prices are
**tier-resolved** (ADR 0031) and a guest must not learn tiers exist. A product
may be unpublished, repriced or soft-deleted after it was added (ADR 0036,
ADR 0022), so a cart is **stale by construction** — and it is expected to sit in
a browser for weeks. And FR-CART-03 admits guests, who have no account row to
hang anything off.

Alternatives considered: a `carts` table keyed by account or session cookie;
pricing exclusively server-side, with the browser holding no figures; storing a
per-unit price on the order line beside the line total; a pgEnum for the order
status; normalizing a cart line onto the largest unit it fills.

## Decision

The cart lives in `localStorage` as a versioned record whose lines are keyed by
**slug** (ADR 0042; **slug + unit** as first decided), kept indefinitely and
reported against on return; totals are
exact on both sides through one shared helper, with `POST /cart/preview` as a
freshness and validity check rather than the pricing path; submission re-prices
from scratch and refuses a cart that has moved; and an order is a self-contained
snapshot storing `priceMinor` plus its basis rather than a per-unit price, under
a human-readable reference and an unguessable token.

## Rationale

**The cart is client-only**, for guests and customers alike: no cart table, no
server session state, no expiry job to write or operate. The record is
strictly-necessary storage in the sense ADR 0011 uses, so it is exempt from the
consent gate. A server-side cart shared between devices is deferred, not
rejected — adding a `carts` table later is additive, because the browser record
stays the source of truth for a guest either way.

⚠ **Superseded by ADR 0042.** The two paragraphs below made a unit a quantity
dimension — a line was a product in a unit, and moving between units was a lossy
conversion the customer had to agree to. A unit is now a lens on an integer
piece count: a line is identified by its slug alone, its quantity is in pieces,
and changing unit is a re-render with nothing to round and nothing to confirm.
They are kept because the rest of this ADR reasons from them.

**A line is a product in a unit**, and nothing else. Its quantity is in that
unit, and **the unit is never normalized**: four packs that happen to fill a box
stay four packs, in the cart, on the order and in both mails. The customer's
choice of unit is a statement about how they want the goods described and
handled, not an encoding of a piece count, so folding it into a larger unit
would silently rewrite what they said. Two lines of the same product in
different units therefore coexist, and only same-unit lines merge.

**Changing a line's unit is the customer's business, and the conversion is
asked about rather than assumed** (FR-CART-02). Converting down — box to pack,
pack to piece — is exact and silent: one box of four packs becomes four packs.
Converting up usually is not, because the held quantity is rarely a whole number
of the larger unit, so the quantity is rounded **up** to the next whole one and
the customer is asked first, naming both numbers ("a box holds 4 pk; increase
2 pk to 4 pk?"). Rounding up is the direction FR-UNIT-03 already corrects in, and
asking rather than doing it quietly is why that rule reports itself. Two things
are easy to miss: a down-conversion to pieces must still pass
`correctPieceQuantity`, so it can round up after all; and a converted line may
land on an existing line of the same product and unit, in which case the
quantities add, any two notes are joined for the customer to tidy, and the page
says it happened. The arithmetic lives beside `correctPieceQuantity` in
`product-units.ts`, so no surface converts differently.

**The line note is a preference for the whole line, not part of its identity**
(FR-CART-08). It exists for collective articles whose variant is stated in words
— "100 in colour A, 100 in colour B" against a single line of 200 — which a
manager reads and acts on. That makes it free text hanging off the line, never a
key: splitting a line per note would force a customer to add the same article
twice and would make the cart argue with itself about what one line means. It is
**off or optional, never required**: a customer who does not care which colour
they get must be able to order without inventing an answer. Two values means a
boolean column plus a nullable per-product prompt, and if a `required` state is
ever wanted it arrives as a varchar with a CHECK, not as a pgEnum — the
transaction trap below applies to it just as much. Both fields are admin-entered
and not synced, the ownership argument ADR 0022 and ADR 0035 already make for
packaging.

**Totals are exact on both sides, and the browser computes them.**
`priceBasisPieces` stays withheld (ADR 0035), but `pack` and `box` prices are
already integers the browser can multiply. Only the piece case was blocked, and
only because `pieceMilliMinor` is the deliberately-inexact comparison figure. The
fix needs no basis: the database guarantees the basis divides `minPieceQty`, and
`correctPieceQuantity` guarantees every purchasable piece quantity is a whole
multiple of the minimum, so **one minimum lot has an exact integer price** and
every piece total is `pieceLotMinor × (quantity ÷ minPieceQty)`. Hence
`pieceLotMinor` on `unitPricesSchema` and one `exactLineTotal()` helper both
sides compute through.

That is what lets the header show a running total on first paint instead of a
bare count, and it **demotes the preview endpoint**: `POST /cart/preview` is a
freshness and validity check, called when the cart page loads and when signing
in re-prices what is held — not per keystroke, and not before checkout, where
submission's own `cart-changed` refusal already covers a cart that moved. It
answers 200 with per-line advisories as **codes**, never messages, because a stale cart is a
normal state to be shown rather than a request to refuse. Submission is the
opposite: it re-prices from scratch and refuses with `cart-changed` if anything
moved, comparing against an `expectedTotalMinor` echoed from the last preview.
That figure is a **comparand, never an input** — without it, a customer previews
€100, an admin edits the price, and the submit books €120 in silence.

**A cart survives for as long as its payload version does, and says what changed
while it waited** (FR-CART-10). Each line records when it was added and the price
it was last seen at, so the preview that loads the cart also produces a diff: this
went up, that went down, this one is no longer available, that quantity was
corrected. It is shown once, in a dismissible summary, and the baseline is then
updated — a customer who has read that a price rose does not need telling again
on every visit. This is what makes a weeks-old cart honest rather than merely
present.

**Signing in re-baselines silently.** A customer's tier changes what the same
cart costs, and that is not a change to the catalog: it is the price they were
always entitled to. Reporting it would announce the tier machinery to the one
person who is not supposed to have to think about it, and would read as a price
change caused by the shop rather than by who is looking. So sign-in and sign-out
reset the stored baselines without producing a diff, and the change summary stays
about the catalog.

**The reference is readable, the token is the capability.** The reference is
`{prefix}-YYMMDD-NNNN` — a prefix from `deployment.json`, the order's date, and
a random four-digit suffix — so a manager reads the date off it while nothing
discloses how many orders a day the shop takes. A sequence would have leaked
exactly that. The suffix is random rather than counted, which means collisions
are possible rather than impossible: the insert retries on the unique violation,
bounded, and the date part keeps the space per day to itself. The date is taken
in the deployment's configured timezone and snapshotted, or an evening order
carries yesterday's number.

Precisely because that reference is partly guessable, it is **not** a capability.
Orders therefore carry a separate `publicToken`, unguessable and unique, which is
what a **guest's** confirmation mail links to (FR-NOTIF-06) — a guest has no
account page, and this is their only way back to what they ordered. A signed-in
customer's mail links to their own order page instead: no capability URL is
mailed for something the account can already open. The page the token opens is
the customer view, read-only, `noindex`, referrer-suppressed and rate-limited,
and it serves whoever holds the link, account or not. It does not expire; if a
reason to expire it appears, that is a column and a check, not a redesign.

Referrer suppression is the token page's own
`<meta name="referrer" content="no-referrer">`, set beside its `noindex`, because
the URL _is_ the credential: without it, one click on any outbound link hands the
token to whatever is on the other end.

**Orders are self-contained snapshots.** An order copies what it was about —
product names, prices, addresses, contact details, the currency code, the office
picked up from — rather than pointing at rows that will change. Re-tiering a
price list, renaming a product, editing an address or reconfiguring the offices
must not retroactively rewrite what a customer asked for and what a manager was
told. `order_items` keeps a `productId` foreign key for navigation and
denormalizes `productSourceId` beside it, the same reason `syncRuns` denormalizes
`actorEmail`.

**There is deliberately no `unitPriceMinor` column.** For a piece line there is
no exact integer per-unit price: a product with a basis of ten and a price of
1999 costs 199.9 minor units a piece. A rounded per-unit price beside the line
total would put two columns in the table that look multiplicable and are not,
and the confirmation mail, iteration 8's order PDF and any partial cancellation
would each be wrong by cents a line. The line stores `priceMinor` **plus**
`priceBasisPieces`, which is exact and reconstructible, and the database enforces
it as its sibling `products_basis_divides_quantities` does:
`pieces % priceBasisPieces = 0` and
`lineTotalMinor = priceMinor * (pieces / priceBasisPieces)`.

Those two columns are also what the **staff view of an order is expressed in**. A
manager handling one box of 100 pieces priced per ten needs to read "10 × €19.99",
because ten is what the source system holds and what the invoice will be checked
against; the customer reads a unit, a quantity and a line total, and never the
basis. One stored line, two renderings, and the staff one needs no extra column
because the basis is already there.

**The order status is a varchar with a CHECK constraint, not a pgEnum.**
`migrate.ts` runs the whole pending set through drizzle's `migrate()`, inside one
transaction, and Postgres forbids _using_ an enum value added in the same
transaction — so iteration 8's "add `paid`, then reference it" would fail on a
fresh database and pass on an incrementally-migrated one, the worst available
failure shape. A CHECK is dropped and recreated in one migration; an enum value
can never be removed at all. Opening set: `requested`, `approved`, `declined`,
`cancelled`, of which this iteration writes only `requested`. Beside it sit
`statusChangedAt` and `statusChangedBy`, following the
`publishedBy`/`approvedBy`/`deletedBy` habit — FR-ACC-01 shows a status, and a
status with no date is a status with no story.

Anonymization reaches orders; see the ADR 0032 amendment for what is scrubbed and
for the guest-order limitation that comes with it.

## Consequences

- (+) No cart table, session store or expiry job: a guest's cart works exactly as
  a customer's does and costs the server nothing to operate.
- (+) A total is exact on both sides and computed once, so the header, the cart,
  the checkout preview, the order row and both mails cannot disagree.
- (+) A cart left for a fortnight comes back current, and says what moved.
- (+) An order stays readable for its whole life, whatever changes around it.
- (+) The line stores what the source system prices in, so a manager reads an
  order in the units they already reconcile against.
- (+) A guest can reach their order without an account, and the reference stays
  safe to quote on the phone because it is not what opens it.
- (+) Iteration 8 can add a status value in a single migration that also uses it.
- (−) **No cross-device cart, no abandoned-cart view, no "manager opens the
  customer's cart"** — nothing in the requirements asks for any of them — and a
  cart is lost with the browser profile.
- (−) The browser now holds prices, so ADR 0035's ⚠ is live rather than
  structurally unreachable, and every new total is a chance to multiply the wrong
  figure.
- (−) Two pricing surfaces exist, the browser's helper and the server's pricer,
  and they must agree; the server's publication and soft-delete predicate has no
  client counterpart.
- (−) References can collide, so the insert has to retry. At a few dozen orders a
  day the odds are small but not negligible, and a retry loop that gives up must
  fail loudly rather than write a duplicate.
- (−) A link that opens an order lives in a mailbox indefinitely, so a forwarded
  confirmation forwards the order with it.
- (−) The shipment summary is an estimate for anything short of whole boxes, and
  a customer may read a carton count that freight later contradicts.
- (⚠) A cart is stale by construction. Every preview and every submission must
  re-apply the publication gate and the soft delete; a forgotten call site is the
  trap the sitemap hit in iteration 5.
- (⚠) An unknown slug must come back as `unavailable`, never a 404 and never a
  dropped line, or preview becomes an oracle that enumerates the unpublished
  catalog by difference. Never-existed, soft-deleted and unpublished share one
  code.
- (⚠) The server must never mutate the browser's cart: preview flags a dead line
  and nothing prunes it; removing it is an explicit action, and submission
  refuses rather than silently dropping one.
- (⚠) `totalMinor()` returns null, not a rounded number, when the pieces are not
  a whole multiple of the basis — a state a repackaged product can reach. It
  travels as its own code and is never coalesced to a zero on screen.
- (⚠) `tierKey` on the order is staff-facing and must not appear on the
  customer's order view or in either mail; `productSourceId` is never serialized
  to a customer at all (ADR 0022); and the token view is a customer view, so both
  rules apply to it.
- (⚠) A thumbnail snapshotted onto an order line is a media reference, so the
  media-prune scan must include those URLs — the trap `products.images` and
  `categories.image` already carry.

## The shipment summary, pinned

`boxVolume` and `boxWeight` are the totals for one box unit across the `boxCount`
cartons it ships as, so a line of _q_ boxes contributes `q × boxCount` cartons
and `q × boxVolume`: the multiplier is the ordered quantity, never `boxCount`
against the volume (FR-UNIT-11). Piece and pack lines are derived proportionally
from those same figures through the packaging ratios, and **cartons round up** —
50 pieces of a 100-piece box is one carton, 101 pieces is two — because a carton
is a physical count, while weight is genuinely proportional and volume is
proportional as the working approximation. A part-full carton in reality gets
bagged in with something else, so the estimate deliberately overstates rather
than understates, and it is labelled approximate and subject to a manager's
confirmation. A product with no packaging figures contributes nothing, so the
summary states what it covers rather than silently omitting it.
