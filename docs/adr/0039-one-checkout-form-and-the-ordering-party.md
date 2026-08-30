# 0039 — One prefilled checkout form, and the party it is invoiced to

**Status:** accepted · **Date:** 2026-08-23

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
delivery, the party the account is registered as, the address the book already
holds, cash on delivery — so for most orders the form arrives answered and the
customer is confirming rather than filling. A wizard would break an
almost-finished form into four screens of navigation, and the customer would
click through pages to change nothing. It also spends state on remembering where
they are, which is state that can be wrong. The path is cart → checkout →
preview → send, and the preview is the second screen, not the fifth.

**Prefill is the feature, so its sources are part of the decision.** Fulfilment
defaults to delivery; the party to the one the account is registered as; the
delivery and billing addresses to the book's only entry, or the first of several;
payment to cash. A guest gets the same form with nothing prefilled and nothing
saved afterwards.

**A guest is asked the two questions an account would have answered, as one.**
The contact (FR-CART-03) and the invoiced party (FR-CART-09) are separate fields
of an order, but for a guest ordering as a private person they are the same
person — so asking both separately asked one visitor for their name twice. The
guest form therefore opens with registration's own switch: a private person
gives a name, an email and a phone number, and is the party; a company gives its
name and registration number and then somebody at it to ring. A signed-in
customer sees neither — the account answers the contact, and the party row
offers it as the first of two choices.

**Checkout is not behind a login, and does not ask which door to come in by.**
An account needs a manager's approval (ADR 0032), so registration cannot finish
the order in front of it, and an interstitial offering three doors would be
offering one that does not open. The guest goes straight into the form; the
offer to sign in stands beside it, next to the figures it is about, because
prices are tiered and a customer who checks out as a guest is quoted the lowest
tier's. An account is offered again on the confirmation, where waiting for
approval costs nothing.

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
can decide the price. So the form asks it directly, in three answers — the
account's own party, another person, another company — and the answer is
snapshotted onto the order beside the address, never merged into it. It is drawn
as two choices with the second forking into person or company, because the fork
is what changes the fields: a company is asked for a registration number and a
person is not.

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
an ordinary order. Neither role is recorded on the row, and the order keeps no
reference back to it: a stored "usable for billing" flag would be a second source
of truth that goes stale the moment the row is edited, the reasoning that made
attributes rows rather than jsonb in ADR 0037. What the order keeps is the
address itself, copied in.

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
  on every order rather than picking a saved profile.
- (−) A customer who delivers to one address and invoices to another sets that
  pair up on every order: the form opens on the book's first row for both. A
  cheap fix exists — record which rows an order used and default the next one
  from them — and is deliberately not built, because it pays off only for an
  account with several addresses and a habit of splitting them.
- (−) One form is long on a small screen, and a validation error can sit off
  screen. Errors have to be summarised where the submit button is, not only at
  the field.
- (−) Delivery zones change with a config deploy, not from the admin panel. If
  the client edits them often, they belong in the CMS and this is the decision to
  revisit.
- (−) A guest cannot save an address — there is no account to save against — so
  FR-CART-04's "reusable" is unachievable for them by construction.
- (−) A guest quoted the lowest tier's prices may be an existing customer who did
  not notice the offer to sign in. Nothing enforces it, by design: the manager
  reviewing the order is the correction.
- (⚠) A guest's form is the one the public can post, so it carries the honeypot
  (ADR 0015) and the public-form rate limit; a customer's does not need either.
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
- (⚠) The party, the addresses and the collection point are **snapshotted** onto
  the order, never referenced, or a config edit, an account change or an edited
  address row rewrites what was agreed. Nothing on the order points back at the
  book: a row is editable and deletable, so a reference to one would name
  something else by the time anybody read it.

## Open

Nothing outstanding. Address suggestion, which this form's prefill cannot cover,
and the delivery-zone rules the fulfilment choice reads are ADR 0040.

## Amendment — 2026-08-29: the invoice address is a deployment's answer

Testing the first real deployment found this ADR's "asked for pickup too" wrong
for it: it invoices to the address the goods go to, and a collected order to no
address at all. That is a **locale**, not a preference — where an invoice
carries an address at all differs by jurisdiction — so it joins the config file
as `billingAddressEnabled` rather than becoming a second checkout design.

Where it is off, the delivery picker loses its "send the invoice here as well"
tick, the second picker never appears, a collected order asks for no address,
and neither the read-back nor the order afterwards says anything about an
invoice address. The order's `billing*` columns are **nullable** and empty —
not the delivery address copied across, which would be the order claiming
something nobody asked for, and not empty strings, which cannot be told from a
column nobody filled in. The server holds every submission to the deployment's
own answer: it refuses one that carries no address where it invoices one, and
stores none where it does not, because a form that stops asking is not what
makes a column empty.

Two rules that were pending here are also settled. Cash is **not offered for a
company** — a company is invoiced or pays by card (FR-CART-04) — which makes
the payment row the mirror of the transfer rule it already had: each party sees
one method and the other greyed with its reason. And the preferred date now
offers only days the shop could work on: nothing today or earlier, and no
weekend (`order-dates`). No holiday calendar — it differs by deployment and by
year, a manager confirms every date anyway, and a half-right calendar is worse
than two rules a customer can predict. A draft restored from an earlier visit
drops a date that has since gone stale rather than being refused over it.
