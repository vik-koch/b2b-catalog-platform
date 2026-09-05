# 0047 — Pair products mutually, and check the cart rather than the add

**Status:** accepted · **Date:** 2026-09-04

## Context

A few products in the catalog are not sold alone: a cup wants a lid, and several
lid articles fit the same cup. The client's rule is symmetric — a lid is not
sold without a cup either — and the quantities have to match, in pieces, so six
cups may be answered by three of one lid and three of another. Fewer than one
product in a hundred is affected. Requirements: FR-SET-01…05, FR-CART-02.

Alternatives considered: a named set entity with members, and a requirement
pointing a product at a set; a directional "A requires N of group G" rule with a
ratio; validating at the moment of adding.

## Decision

- **A pairing is an undirected edge between two products**, stored once with the
  smaller id on the A side. A product's counterparts are its neighbours.
- **The rule is per product, allocated in pieces:** every paired product in the
  cart must have its own piece count covered by pieces of its counterparts, and
  no counterpart's pieces may cover two products at once. The ratio is fixed at
  one to one.
- **The check runs on the cart**, over all lines at once, and again server-side
  at checkout. Adding a product does not validate; it offers.
- **Unsatisfied is advisory by default**, with one deployment-wide flag
  (`catalog.pairingsEnforced`) to enforce it. There is no per-product flag. The
  API applies the flag too, refusing with its own code and the shortfalls —
  never as `cart-changed`, because nothing about the cart changed.
- **Pairings are admin-owned and edited from either side.** They live on the
  product form and are saved with it, wholesale: what a save sends is the whole
  set from that product's side, so removing a counterpart there removes the
  pairing from the counterpart too. A bulk sync neither creates nor clears them.
- **A counterpart that is soft-deleted or unpublished keeps its edge**, marked
  in the editor. Only a hard delete removes one, by cascade. The storefront
  counts and lists only counterparts it can sell.
- **One marker, two shapes.** A glyph in the buying controls' price row where
  that is all the room there is, the same glyph with the word beside it where
  there is a line to spare, and one modal behind both — the counterparts as
  product rows with their own buying controls.

## Rationale

**Edges express what a group cannot.** A group model partitions the catalog: cup
A and cup B require lid group L. But the client's own example does not
partition — A pairs with B and C, while B pairs with A and D — and a group
would have to be duplicated to say it. An edge says it directly, and at this
volume there is nothing to optimise: a set of pairings is a search field and a
list on the product form, and the mutual half is written by the same save.

**One rule covers both directions.** Because the edge is symmetric, "6 × A and
10 × B" is checked twice from the same expression: A draws 6 of B's 10 and is
satisfied; B can draw only 6 from A, so B is four short and the cart offers A or
D. No second rule, no notion of which side is the accessory.

**Allocation is a flow, and the flow is small.** Summing a counterpart's pieces
is not the rule: a cart of 10 A, 10 C and 10 B, where A and C both pair with B,
has enough B for either but not for both. Stated as a bipartite feasibility
question — demands on one side, the same products as supplies on the other — it
is an augmenting-path search over a few dozen nodes, and it earns those lines
twice. The sum errs only towards _approving_ a cart the rule refuses, which
under enforcement means accepting an order the shop's own rule rejects; and the
flow already computes which product is short, so the cart does not need a
display rule to keep the satisfied side quiet.

**A ratio is not needed yet.** Every case the client has is one to one in
pieces. A nullable ratio on the edge adds a field, a form control and an
explanation for a case nobody has; it can be added later without changing what
is stored.

**The panel is a modal, and it does not nest.** It holds product rows with
their own buying controls, which need most of a phone's width to lay out; a
bubble that size is a bubble in name only, and would have become a modal on a
phone regardless. The rows carry no marker of their own — the edge being
symmetric, a counterpart's counterpart is the product the panel was opened
from, and a modal has no history to walk back through.

**Adding cannot answer the question.** Several lines can satisfy one pairing and
one line can unsatisfy several, so a check at add time either fires on carts that
are about to be fine or stays silent on carts that are not. The cart is where the
whole picture exists, and it is one screen before checkout.

**Advisory by default, because a manager reads every order.** A hard block buys
little against a customer who genuinely wants cups without lids, and costs a
support call when they do. The flag exists for a deployment that disagrees.

**A hidden counterpart is not a removed one.** A soft delete is reversible and
an unpublished product is usually one still being prepared. Dropping the edge on
either would rewrite the _other_ product's pairings from a screen nobody opened,
and it could not be undone by restoring the product. The storefront and the cart
skip what they cannot sell; the editor keeps saying what the admin said.

## Consequences

- (+) Two columns and a check constraint carry the model; there is no set entity
  to name, own or garbage-collect. The constraint is what makes one pairing one
  row, and it refuses a product paired with itself.
- (+) The marker takes the note icon's place in the price row, and the panel is
  a list of the same product rows a listing is made of — nothing new to draw.
- (−) **Which product is reported short is a choice, where the shortfall is
  shared.** The matching says how much cover is missing; it does not say whose
  it is when two products draw on one counterpart. The lines are walked in a
  fixed order so the answer is at least the same every time, and the customer is
  told the same total either way.
- (−) **Every product read carries a counterpart count**, a correlated subquery
  per row, so that a tile can draw the marker without a second request. The list
  behind it is fetched only for the product whose marker is pressed.
- (−) Editing from either side means a save can undo an edit made on the other,
  last-write-wins, with nothing in between to detect it. Pairings are few and
  rarely touched, and the alternative — diffing an edge set against what was
  loaded — is machinery for a collision nobody has had.
- (−) A pairing is invisible to the sync, so a re-imported catalog keeps its
  pairings and a product that disappears from the source takes its own with it.
