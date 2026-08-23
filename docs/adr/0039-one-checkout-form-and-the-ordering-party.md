# 0039 — One prefilled checkout form, and name the party being ordered for

**Status:** accepted · **Date:** 2026-08-23

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

Checkout is **one form** covering fulfilment, party, address and payment, with
every choice prefilled to a working default and only the fields a choice makes
relevant revealed, followed by a preview of the whole order and a send button.
Delivery zones and pickup locations come from `deployment.json`; the ordering
party is prefilled from the account's registration or entered as another party,
with prices provisional in that case; addresses come from one account-scoped
book with no billing/delivery distinction; and the payment method is recorded,
not executed.

## Rationale

**One form, not a wizard.** Every question here has a defensible default —
delivery, the party the account is registered as, the address last used, cash on
delivery — so for most orders the form arrives already answered and the customer
is confirming rather than filling. A wizard would break an almost-finished form
into four screens of navigation, and the customer would click through pages to
change nothing. It also spends state on remembering where they are, which is
state that can be wrong. The path is cart → checkout → preview → send, and the
preview is the second screen, not the fifth.

**Prefill is the feature, so its sources are part of the decision.** Fulfilment
defaults to delivery; the party to the one derived from the account; the address
to the most recently used entry in the book, or the only one; payment to cash. A
guest gets the same form with nothing prefilled and nothing saved afterwards,
which is the only structural difference between the two cases.

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
applies in it, resolved from the address the customer enters (ADR 0040). Pickup
lists the same `locations` the contact page uses, with their map link and
description — one source, so an office cannot read differently in two places.

`locations` therefore needs a stable **`key`** per entry, and the API's config
slice needs to read `locations` at all, which it does not today: a submitted
pickup key must be validated rather than trusted, and the order snapshots the
office's name and address as they read at the time, because config is editable
and an order must stay readable regardless.

**The ordering party is asked because it is not always the account** (FR-CART-09).
A sole trader may buy privately, and a private customer may be buying for a
company; who the goods are invoiced to decides the paperwork and can decide the
price. The first option is prefilled from the account: `customerType = person`
gives a natural person, and for a company the format matching the stored
registration number says which kind it is — so `companyIdInput.formats[]` gains a
**`partyKind`** (`sole-trader | legal-entity`), and the account's kind is
**derived** through the existing `companyIdFormatOf()` rather than stored. That
helper already exists for exactly this question on the staff editor, deriving
costs no migration and no backfill of numbers whose format predates the config,
and the order snapshots the party anyway, so a later config change cannot rewrite
history — only future prefills. Where nothing matches, the customer is asked
instead of guessed at.

The second option is another party entirely: a name, and an optional registration
number validated against the same formats. This is also where the missing company
name from ADR 0032 is finally supplied — by the address entry or typed here —
which is why not collecting it at registration cost nothing. Because the
customer's tier belongs to the **account**, not to the party it is buying for, a
third-party order says plainly that the manager confirms the price. That is not
an apology for the design; it is what an order request is, and it is the honest
place to say so.

**One address book, no `kind`, asked for pickup too.** FR-CART-04 wants
legal-entity details saved and reusable; FR-CART-07 wants a delivery address.
Those are the same shape and frequently the same row, so a discriminator would
force a customer to enter their office twice and keep the copies in step.
Self-pickup still asks for one, because the address on the paperwork is a
property of the party, not of who carries the goods. There is no stored "usable
for billing" flag either: bank transfer needs a company name and a tax ID, and
the **server re-checks that at submission**, refusing with a code — a flag would
be a second source of truth that goes stale the moment the row is edited, the
same reasoning that made attributes rows rather than jsonb in ADR 0037.
`country` is a **code**, not free text, or an immutable snapshot reads `DE` on
one order and `Deutschland` on the next and nobody can group by it. `taxId`
prefills from the account's registration number at the form rather than by
foreign key, since that number is evidence staff approved on and an address is
free to carry a different one.

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
- (+) Zones and offices are configuration, so a deployment changes them without a
  migration, and the contact page and checkout cannot disagree about an office.
- (+) One address book means an office is entered once and reused for billing and
  delivery alike.
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
- (−) `addresses.taxId` accepts one jurisdiction's formats, those configured for
  the deployment, so a foreign legal entity cannot be entered. Single-locale and
  single-jurisdiction by design.
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
  referenced, or a config edit or an address change rewrites what was agreed.

## Open

Nothing outstanding. Address suggestion, which this form's prefill cannot cover,
and the delivery-zone rules the fulfilment choice reads are ADR 0040.
