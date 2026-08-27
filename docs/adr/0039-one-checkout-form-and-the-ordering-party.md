# 0039 — One prefilled checkout form, and the party it is invoiced to

**Status:** accepted (revised 2026-08-27) · **Date:** 2026-08-23

## Context

An order here is a **request**: a manager reviews every one, and delivery or
pickup is arranged by phone or email afterwards (FR-CART-07). Checkout therefore
collects what a manager needs to make that call, and nothing it cannot honour.
Since a human is going to read the order anyway, the form's job is to be quick,
not to be exhaustive.

Requirements: FR-CART-03/04/07/09. Constraints from what already exists:
registration records a `customerType` and, for a company, both its name and a
registration number validated against the deployment's `companyIdInput.formats`
(ADR 0032); offices and delivery zones live in `deployment.json`; and a guest
has no account to save anything against.

Alternatives considered: a multi-step wizard with a route per step; **carrying
the invoiced party's identity on the address row**, so that choosing an address
named the party; a `kind` column separating billing from delivery addresses;
storing the party kind on the account at registration; delivery rules as an
admin-editable page rather than configuration; and executing card payment at
checkout.

## Decision

Checkout is **one form** covering fulfilment, party, address and payment, with
every choice prefilled to a working default and only the fields a choice makes
relevant revealed, followed by a preview of the whole order and a send button.

The **invoiced party is its own answer** — a name, and for a company a
registration number — resolved from the account or typed for anybody else, and
snapshotted onto the order. **Addresses are places**: one account-scoped book
whose rows carry no identity and no billing/delivery kind. Delivery zones and
collection points come from `deployment.json`. The payment method is recorded,
not executed.

## Rationale

**One form, not a wizard.** Every question here has a defensible default —
delivery, the party the account is registered as, the addresses the last order
used, cash on delivery — so for most orders the form arrives already answered
and the customer is confirming rather than filling. A wizard would break an
almost-finished form into four screens of navigation, and the customer would
click through pages to change nothing. It also spends state on remembering where
they are, which is state that can be wrong. The path is cart → checkout →
preview → send, and the preview is the second screen, not the fifth.

**Prefill is the feature, so its sources are part of the decision.** Fulfilment
defaults to delivery; the party to the one the account is registered as; the
delivery and billing addresses to the pair the last order used, or to the only
entry in the book; payment to cash. A guest gets the same form with nothing
prefilled and nothing saved afterwards, which is the only structural difference
between the two cases.

**Conditional reveal, kept disciplined.** Pickup replaces the delivery address
with a collection point; a third-party order reveals the fields naming it. What
is hidden must be **inert**, not merely invisible — removed from the form model
rather than styled away — or an abandoned branch submits values the customer
never saw, and the server refuses an order for a reason nothing on screen
explains. The preview before sending is what closes that loop: it shows the
lines, the shipment estimate and every answer as it will be submitted, alongside
the privacy consent the other public forms already ask for, so nothing reaches a
manager that the customer has not read back.

**Fulfilment leads the form** because it decides the most. Delivery opens its
rules in a popup rather than sending the customer away mid-checkout: a list of
zone cards (a city, its surrounding area, the country, everything beyond) with a
title and a short description each, from `deployment.json`. Those are
per-deployment operational facts of the same class as the currency, not catalog
content, so they are configuration; the binding long form stays on the
admin-editable `conditions` page (FR-NAV-03, ADR 0027), which the popup links
to, so the two are one summary and one authority rather than two copies of the
same rules. A zone also carries the free-delivery minimum that applies in it,
resolved from the address the customer enters (ADR 0040).

Pickup lists the points an order may be collected from — `pickup.locations`,
its own configured list rather than the contact page's offices. Goods are
collected from a warehouse or a depot as readily as from an office, and an
office that takes enquiries need not hand anything over, so neither list is a
subset of the other. Each point carries a **`key`**, a name and an `address`;
the API validates a submitted key against them rather than trusting it, and the
order snapshots the point's name and address as they read at the time, because
config is editable and an order must stay readable regardless. The map beside a
point is an ordinary outbound link, not the contact page's iframe embed: it is
looked up before ever reaching the form.

**The invoiced party is an order field, not a property of an address**
(FR-CART-09). A sole trader may buy privately, and a private customer may be
buying for a company; who the goods are invoiced to decides the paperwork and
can decide the price. So the form asks it directly, in three options — the
account's own party, another person, another company — and the answer is
snapshotted onto the order beside the address, never merged into it.

Carrying that identity on the address row instead was tried and rejected. It
reads well for a customer whose company and address move together, and fails
the moment they do not: an order invoiced to one company at another's saved
address either contradicts itself on screen or silently rewrites the row, and
"save this address" would then create a book entry describing a party nobody
typed. The database already separates the two — the party's name and number are
their own columns on the order, apart from the address lines — so honouring
that split costs nothing and removes the merge entirely.

An address therefore carries no `companyName`, no `companyId` and no `phone`.
The first two were there to supply a company name that registration did not
collect; it does now, so they are a second place for a fact the account already
states. The third is a courier's field, and this deployment arranges delivery by
phone between customer and manager (FR-CART-07) against the `contact` the order
already requires.

**Another company gives both a name and a number**, on the same rule as
registration and against the same configured formats — a sole trader in a
jurisdiction that numbers them lands here and has one to give, which is why no
party _kind_ is stored or derived. Another person gives a name alone. Because
the customer's tier belongs to the **account**, not to the party it is buying
for, an order invoiced to anyone else says plainly that the manager confirms the
price.

**One address book, no `kind`, asked for pickup too.** FR-CART-07 wants a
delivery address; an invoice needs one as well, and they are the same shape and
frequently the same row — so a discriminator would force a customer to enter
their office twice and keep the copies in step. Self-pickup still asks for one,
because the address on the paperwork is a property of the order, not of who
carries the goods.

The two roles are chosen per order, not per row: the form asks for a delivery
address and then offers **"invoice to this address as well", checked**, with
unchecking revealing a second picker over the same book. The pair need not
agree — a company invoiced at its office and delivered to an employee's flat is
an ordinary order. Which two rows an order used is recorded on the order, so the
next checkout prefills both from the last one rather than from a flag on the
book; a stored "usable for billing" flag would be a second source of truth that
goes stale the moment the row is edited, the reasoning that made attributes rows
rather than jsonb in ADR 0037.

`country` is a **code**, not free text, or an immutable snapshot reads `DE` on
one order and `Deutschland` on the next and nobody can group by it; where a
deployment configures exactly one country the field is not drawn at all. A
region is always asked for: an address-suggestion provider fills it without
anybody typing (ADR 0040), and a jurisdiction that never uses one simply leaves
it empty.

**Payment is recorded, not executed.** The options are cash on delivery or
pickup, bank transfer, and card. Cash is the shop's ordinary case and is the
default; bank transfer invoices a legal entity, so it is offered only where the
party is a company (FR-CART-04) and the **server re-checks that at submission**,
refusing with a code; card stays unavailable until iteration 8, and is in any
case only reachable after a manager has approved the request (FR-CART-06). The
choice is taken here because it decides what the form asks for, not because
anything is charged.

## Consequences

- (+) A returning customer's checkout is a read-through and one click, because
  the form arrives answered.
- (+) No step state to hold, restore or get wrong, and no navigation to design.
- (+) Zones and collection points are configuration, so a deployment changes
  them without a migration.
- (+) The party and the address are independent, so neither can silently rewrite
  the other and no book row acquires an identity nobody typed.
- (+) An address is four fields and a country, which is short enough to ask for
  inline at checkout rather than sending anyone to the account first.
- (+) Ordering for another party is a first-class case rather than a note in the
  customer comment, so a manager sees who to invoice without reading prose.
- (+) No party kind is stored, so nothing has to be backfilled and no account
  carries a classification that its registration number contradicts.
- (−) A customer invoicing two of their own companies answers the party question
  on every order rather than picking a saved profile. Prefill from the last
  order is what keeps that to a glance.
- (−) One form is long on a small screen, and a validation error can sit off
  screen. Errors have to be summarised where the submit button is, not only at
  the field.
- (−) Delivery zones change with a config deploy, not from the admin panel. If
  the client edits them often, they belong in the CMS and this is the decision to
  revisit.
- (−) A guest cannot save an address — there is no account to save against — so
  FR-CART-04's "reusable" is unachievable for them by construction.
- (−) A party's registration number accepts one jurisdiction's formats, those
  configured for the deployment, so a foreign legal entity cannot be entered.
  Single-locale and single-jurisdiction by design.
- (−) A private customer cannot pay by bank transfer, which follows from
  FR-CART-04 rather than from this design, and is said at the payment row rather
  than refused after the form is filled.
- (⚠) A hidden branch must be inert, not merely invisible, or it submits fields
  the customer never saw.
- (⚠) Prefilled is not verified: every field, the pickup key and the party's
  completeness are re-validated server-side at submission.
- (⚠) A third-party order's price is provisional. Iteration 8 decides whether
  such an order may be paid directly at all; until it does, nothing in this flow
  may imply the total is final.
- (⚠) The party and the collection point are **snapshotted** onto the order, not
  referenced, or a config edit or an account change rewrites what was agreed. The
  address rows are _also_ referenced, nullably, but only so the next checkout can
  prefill what was used last — never as the order's record of where it went.

## Open

Nothing outstanding. Address suggestion, which this form's prefill cannot cover,
and the delivery-zone rules the fulfilment choice reads are ADR 0040.
