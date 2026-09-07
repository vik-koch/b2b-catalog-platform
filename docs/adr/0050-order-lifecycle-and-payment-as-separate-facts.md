# 0050 — Track an order's lifecycle and its payment as two facts

**Status:** accepted · **Date:** 2026-09-06

## Context

An order is a request today: it is priced, recorded and mailed, and a manager
answers it by phone or mail. Iteration 11 gives that manager the transitions
the shop actually works in — confirming, preparing, handing over, and being
paid — and gives the customer something to read while it happens. Requirements:
FR-ORD-01…04, FR-CART-04/05, FR-NOTIF-03, FR-WORK-04.

`orders.status` already exists with `requested | approved | declined |
cancelled` behind a check constraint, of which only `requested` has ever been
written.

Alternatives considered: one linear status covering payment and fulfilment
together; separate statuses for "preparing for delivery" and "ready for
pickup"; a status per payment method.

## Decision

- **Two facts, not one chain.** `status` is where the order stands:
  `requested → approved | adjusted → ready → completed`, with `declined` and
  `cancelled` as the two ways it ends. `paymentState` is a second column —
  `not-due | awaiting | paid`, with `paidAt` and `paidBy` — moved by the
  manager recording that money arrived.
- **One `ready`, read two ways.** A collected order reads "ready for pickup", a
  delivered one "handed over for delivery"; `fulfilmentMethod` decides the
  wording. There is no separate preparing state — `approved` is the shop
  working on it.
- **Cash is never `awaiting`.** A cash order stays `not-due` and becomes `paid`
  when the manager records the handover, which is the only moment cash exists.
  Bank transfer and card enter `awaiting` on acceptance.
- **Transitions are service operations with the rule stated once**, in a role
  table the UI calls like any other caller:

  | From                             | To                             | Customer (owner) | Manager / admin |
  | -------------------------------- | ------------------------------ | ---------------- | --------------- |
  | requested                        | approved · adjusted · declined | —                | yes             |
  | requested · adjusted             | cancelled                      | yes              | yes             |
  | approved · adjusted              | ready                          | —                | yes             |
  | approved · adjusted · ready      | cancelled                      | —                | yes             |
  | ready                            | completed                      | —                | yes             |
  | completed · declined · cancelled | requested                      | —                | yes             |

  A guest holds a read link, not a control: the token grants the summary view
  and nothing else, and a guest who wants an order stopped rings the shop.

- **Every ending is undoable, back to `requested` only.** Reopening is staff's
  correction for a wrong click, not a way to change the shop's mind: it clears
  the reason and puts the order back in the queue to be answered again. It
  never lands on an acceptance, because nobody has answered it.

- **Nothing is deleted.** An order the shop will not fill is `declined`, one
  called off is `cancelled`; both carry a reason, and the mail quotes it. The
  shop's own endings are refused without one — a refusal quoted at a customer
  has to explain itself — while a customer calling their own order off is asked
  and not required: they owe the shop no justification for changing their mind.
  The row stays, as an anonymized account's orders do.
- **The vocabulary stays coarse on purpose.** Seven states is what the shop
  distinguishes for a customer, not what a back-office system distinguishes for
  itself.

## Rationale

**Cash proves the axes are independent.** Cash on delivery is paid _after_ the
goods are handed over, so any single chain running "awaiting payment → paid →
ready" is wrong for it, and encoding the exception produces a state per payment
method — the cross product, with `ready-and-paid` and `ready-and-unpaid` as
distinct values a customer would have to be shown different words for.

**"Ready for pickup" and "preparing for delivery" are one fact.** They are the
same moment in the shop's work with different words for the customer, which is
what a rendering rule is for (ADR 0042's lens, applied to a status). Two values
would let an order be in the wrong one for its own fulfilment method.

**The rule belongs in the operation, not the button.** Guards fail closed and
handlers fail open; a transition written as a service operation with a role
table is testable without a browser and serves a second caller later without
being re-derived.

**Coarse states are what survives translation.** A shop's back-office moves an
order through many more steps than a customer should read; collapsing those is
the job of whatever integrates, not a reason to grow the enum here.

## Consequences

- (+) Three added values extend a check constraint that is dropped and
  recreated; `paymentState` defaults on existing rows. Additive, unattended,
  a minor release.
- (+) FR-WORK-04's customer count finally has a source: `awaiting` payment and
  a `ready` pickup are the two states that wait on a customer, and both clear
  when the customer acts.
- (+) The status sort's grouping stays meaningful — unanswered first, then
  in-flight, then the ways an order ends.
- (−) A deployment that picks and packs over days cannot say so; `approved`
  covers everything between confirming and handing over. Splitting it later is
  one more value, not a redesign.
- (−) `paymentState` is a flag, not a ledger: partial payments, refunds and
  amounts received are not modelled. A shop that needs them keeps them where it
  keeps its books.
- (−) A guest cannot cancel without ringing. Making the read token a control
  would put a state change behind a link that has been forwarded by mail.
- (−) A mail is sent per move, so a wrong click corrected a minute later costs
  the customer two mails. Suppressing that means holding the mail rather than
  holding the _state_ — an outbox that coalesces, which iteration 12 needs
  anyway (FR-ADM-08: a repeated or out-of-date update notifies nobody) and
  which is where it should be built, once, for both callers.
