# 0046 — Work awaiting attention is a query, not a table

**Status:** accepted · **Date:** 2026-09-03

## Context

Several things pile up waiting for someone: registrations to approve, products
to publish after a sync, documents to renew, orders to process or to pay for.
Staff currently find out by looking, or from the email that was sent once.
The ask is a marker on the account control and a count beside each section.
Requirements: FR-WORK-01…04.

Alternatives considered: a notification table with per-user read/acknowledge
state and a notification centre listing every item; a "since last login" marker.

## Decision

- **Every count is a query over existing state.** No notification rows, no
  acknowledgement, no per-user read state, no cleanup job.
- **A count clears only when the work is done** — the registration approved, the
  product published, the document renewed, the order moved on.
- **The counts are shown where the work is resolved:** beside each section of
  the admin or account panel, each linking into that section narrowed to the
  items counted. The panel is the notification centre; there is no separate page.
- **One endpoint returns the whole map,** shaped by role, fetched per navigation
  and never rendered on the server, since it is session state.

## Rationale

**These are work queues, not events.** An event is worth storing because it is
gone once it happens; a queue is worth counting because it is still there. Every
item here is a row in a state that the panel can already filter to, so the count
is a `COUNT` over the filter the link opens.

**Acknowledgement would let the badge lie.** Dismiss and resolve are different
acts, and only one of them changes anything: an acknowledged-but-unapproved
registration is exactly the case the marker exists to prevent. With two managers
it is worse — one dismisses, the other never sees it, and the row waits.

**A stored notification needs owners and a lifecycle.** Who it belongs to when
roles change, what happens when its subject is deleted, when it is pruned. All
of that is invented state describing state we already have.

**"Since last login" was rejected earlier** for the same reason and one more:
there is no `lastLoginAt`, and with two managers sharing a queue it is the wrong
question anyway.

## Consequences

- (+) Every later feature registers a count by contributing a query; iterations
  10 and 11 each add one line.
- (+) Nothing can drift. There is no state to reconcile after a migration, a
  restore or a manual database edit.
- (−) The counts are recomputed per navigation. They are indexed counts over
  small tables here, but they are not free, and an unbounded one (expired
  documents in a large catalog) would need a bound before it is added.
- (−) There is no history: a marker cannot say what appeared since yesterday,
  and there is nothing to click to "see all notifications". The panel with its
  counts is what the user gets instead.
- (−) A customer's counts are per account, so they say nothing to a guest, whose
  orders are reached by link (FR-NOTIF-06) rather than by an account page.
