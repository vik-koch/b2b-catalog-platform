# 0039 — One prefilled checkout form, and name the party being ordered for

**Status:** accepted (amended 2026-08-26) · **Date:** 2026-08-23

## Context

An order here is a **request**: a manager reviews every one, and delivery or
pickup is arranged by phone or email afterwards (FR-CART-07). Checkout therefore
collects what a manager needs to make that call, and nothing it cannot honour.
Since a human is going to read the order anyway, the form's job is to be quick,
not to be exhaustive.

Requirements: FR-CART-03/04/07/09. Constraints from what already exists:
registration records a `customerType` and, for a company, a registration number
validated against the deployment's `companyIdInput.formats` — but deliberately
**no company name** (ADR 0032); offices already live in `deployment.json` as
`locations` for the contact page; and a guest has no account to save anything
against.

Alternatives considered: a multi-step wizard with a route per step; a `kind`
column separating billing from delivery addresses; storing the party kind on the
account at registration; delivery rules as an admin-editable page rather than
configuration; and executing card payment at checkout.

## Decision

Checkout is **one form** covering fulfilment, address and payment, with every
choice prefilled to a working default and only the fields a choice makes
relevant revealed, followed by a preview of the whole order and a send button.
Delivery zones and pickup locations come from `deployment.json`; addresses come
from one account-scoped book whose rows are not typed as billing or delivery,
and **the address an order is invoiced to is the party it is ordered for**, so
naming the party is choosing an address rather than answering a question; the
payment method is recorded, not executed.

## Rationale

**One form, not a wizard.** Every question here has a defensible default —
delivery, the addresses the last order used, cash on delivery — so for most
orders the form arrives already answered and the customer is confirming rather
than filling. A wizard would break an almost-finished form
into four screens of navigation, and the customer would click through pages to
change nothing. It also spends state on remembering where they are, which is
state that can be wrong. The path is cart → checkout → preview → send, and the
preview is the second screen, not the fifth.

**Prefill is the feature, so its sources are part of the decision.** Fulfilment
defaults to delivery; the delivery and billing addresses to the pair the last
order used, or to the only entry in the book; payment to cash. A first address
is itself prefilled from the account — the same person, usually the same
company, reachable on the same number — so the first order is not the expensive
one either. A guest gets the same form with nothing prefilled and nothing saved
afterwards, which is the only structural difference between the two cases.

**Conditional reveal, kept disciplined.** Pickup replaces the delivery address
with an office picker; bank transfer reveals the legal-entity fields that cash
does not need. What is hidden must be **inert**, not merely invisible — removed
from the form model rather than styled away — or an abandoned branch submits
values the customer never saw, and the server refuses an order for a reason
nothing on screen explains. The preview before sending is what closes that loop:
it shows the lines, the shipment estimate and every answer as it will be
submitted, alongside the privacy consent the other public forms already ask for,
so nothing reaches a manager that the customer has not read back.

**Fulfilment leads the form** because it decides the most. Delivery opens its
rules in a popup rather than sending the customer away mid-checkout: a list of
zone cards (a city, its surrounding area, the country, everything beyond) with a
title and a short description each, from `deployment.json`. Those are
per-deployment operational facts of the same class as `locations` and the
currency, not catalog content, so they are configuration; the binding long form
stays on the admin-editable `conditions` page (FR-NAV-03, ADR 0027), which the
popup links to, so the two are one summary and one authority rather than two
copies of the same rules. A zone also carries the free-delivery minimum that
applies in it, resolved from the address the customer enters (ADR 0040). Pickup lists
the points an order may be collected from.

⚠ **Amended 2026-08-26.** Those were the contact page's `locations`, on the
reasoning that one source keeps an office from reading differently in two
places. They are now their own configured list, `pickup.locations`: goods are
collected from a warehouse or a depot as readily as from an office, and an
office that takes enquiries need not hand anything over, so neither list is a
subset of the other. Each point carries a **`key`**, a name and an `address`;
the contact offices no longer need a key at all. The map beside a point is an
ordinary link rather than the contact page's iframe embed — it is looked up
before ever reaching the form, and an embed drawn into it is a lot of weight
for that.

The API's config slice therefore reads `pickup` — a submitted key must be
validated rather than trusted — and the order snapshots the point's name and
address as they read at the time, because config is editable and an order must
stay readable regardless.

**The ordering party is the address that is invoiced** (FR-CART-09). A sole
trader may buy privately, and a private customer may be buying for a company;
who the goods are invoiced to decides the paperwork and can decide the price.
That party is exactly what an address row already describes — a company name, a
registration number and where the paperwork goes — so an address is a _profile_
and choosing one is naming the party. Ordering for a second company is adding a
second address, which a customer with two companies would need anyway.

The kind of party is **derived, not stored**: `companyIdInput.formats[]` gains a
**`partyKind`** (`sole-trader | legal-entity`), and the format matching the
address's registration number says which applies, through the existing
`companyIdFormatOf()`. No number means a natural person. Deriving costs no
migration and no backfill of numbers whose format predates the config, and the
order snapshots the party anyway, so a later config change cannot rewrite
history — only future prefills. Where a number matches nothing, the customer is
asked rather than guessed at.

This is also where the missing company name from ADR 0032 is finally supplied —
on the address — which is why not collecting it at registration cost nothing.
Because the customer's tier belongs to the **account**, not to the party it is
buying for, an order invoiced to a party other than the account's own says
plainly that the manager confirms the price. That is not an apology for the
design; it is what an order request is, and it is the honest place to say so.

**One address book, no `kind`, asked for pickup too.** FR-CART-04 wants
legal-entity details saved and reusable; FR-CART-07 wants a delivery address.
Those are the same shape and frequently the same row, so a discriminator would
force a customer to enter their office twice and keep the copies in step.
Self-pickup still asks for one, because the address on the paperwork is a
property of the party, not of who carries the goods.

The two roles are chosen per order, not per row: the form asks for a delivery
address and then offers **"invoice to this address as well", checked**, with
unchecking revealing a second picker over the same book. The pair need not
agree — a company invoiced at its office and delivered to an employee's flat is
an ordinary order — and only the invoiced one is held to anything: bank transfer
needs a company name and a registration number, and the **server re-checks that
at submission**, refusing with a code. There is no stored "usable for billing"
flag for the same reason there is no `kind`: it would be a second source of truth
that goes stale the moment the row is edited, the reasoning that made attributes
rows rather than jsonb in ADR 0037. Which two rows an order used is recorded on
the order itself, so the next checkout prefills both from the last one rather
than from a flag on the book.

`companyId` is the same field registration asks for, masked and validated
against the same `companyIdInput.formats`, and prefills from the account's own
number at the form rather than by foreign key — that number is evidence staff
approved on, and an address is free to carry a different one. `country` is a
**code**, not free text, or an immutable snapshot reads `DE` on one order and
`Deutschland` on the next and nobody can group by it; where a deployment
configures exactly one country the field is not drawn at all, and a region is
asked for only where configured, since an empty column on every order is noise
rather than data.

**Payment is recorded, not executed.** The options are cash on delivery or
pickup, bank transfer, and card. Cash is the shop's ordinary case and is the
default; bank transfer is what reveals the legal-entity fields; card stays
unavailable until iteration 8, and is in any case only reachable after a manager
has approved the request (FR-CART-06). The choice is taken here because it
decides which fields the form asks for, not because anything is charged.

## Consequences

- (+) A returning customer's checkout is a read-through and one click, because
  the form arrives answered.
- (+) No step state to hold, restore or get wrong, and no navigation to design.
- (+) Zones and collection points are configuration, so a deployment changes
  them without a migration.
- (+) One address book means an office is entered once and reused for billing and
  delivery alike, and a delivery address that differs from the invoiced one costs
  a checkbox rather than a second kind of row.
- (+) Ordering for another party is a first-class case rather than a note in the
  customer comment, so a manager sees who to invoice without reading prose.
- (+) No party kind is stored, so nothing has to be backfilled and no account
  carries a classification that its registration number contradicts.
- (−) One form is long on a small screen, and a validation error can sit off
  screen. Errors have to be summarised where the submit button is, not only at
  the field.
- (−) Delivery zones change with a config deploy, not from the admin panel. If
  the client edits them often, they belong in the CMS and this is the decision to
  revisit.
- (−) A guest cannot save an address or a party — there is no account to save
  against — so FR-CART-04's "reusable" is unachievable for them by construction.
- (−) `addresses.companyId` accepts one jurisdiction's formats, those configured
  for the deployment, so a foreign legal entity cannot be entered. Single-locale
  and single-jurisdiction by design.
- (−) Reclassifying or removing a configured format changes what future prefills
  say about existing accounts; past orders are unaffected.
- (⚠) A hidden branch must be inert, not merely invisible, or it submits fields
  the customer never saw.
- (⚠) Prefilled is not verified: every field, the pickup key and the billing
  completeness are re-validated server-side at submission.
- (⚠) A third-party order's price is provisional. Iteration 8 decides whether
  such an order may be paid directly at all; until it does, nothing in this flow
  may imply the total is final.
- (⚠) The party and the office are **snapshotted** onto the order, not
  referenced, or a config edit or an address change rewrites what was agreed. The
  address rows are _also_ referenced, nullably, but only so the next checkout can
  prefill what was used last — never as the order's record of where it went.

## Open

Nothing outstanding. Address suggestion, which this form's prefill cannot cover,
and the delivery-zone rules the fulfilment choice reads are ADR 0040.
