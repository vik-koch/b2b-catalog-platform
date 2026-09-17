# 0061 — The exchange issues no credential and never deletes

**Status:** accepted · **Date:** 2026-09-16

## Context

FR-ADM-11 lets a connected system do, over the machine endpoint, everything a
manager can do to a customer account: invite one into being, approve or refuse a
registration, set its tier and company details, switch it off and back on. The
whole point of it is a deployment nobody has to open the admin panel for.

Two of those actions are not like the others. **Creating an account** normally
ends with somebody being able to sign in, and the obvious shape — the source
system sends the account and its password, since it already holds the customer
record — puts a credential in a feed. **Removing one** is what the source system
does when a customer relationship ends, and its own vocabulary for that is
usually a deletion.

Meanwhile the platform already has FR-AUTH-06: an account holder deletes their
own account, password-confirmed, and what survives is a cleared row that keeps
the orders pointing at somebody.

## Decision

- **The exchange never carries a credential.** There is no password field in
  the customer row and no route that sets one. An account it asks for is
  created in the platform's own `invited` state with an unusable password hash,
  and the platform mails the person the same set-a-password link a manager's
  approval sends. A row may ask for that link to be sent again; it may not ask
  what the link contains.
- **The exchange never deletes.** The strongest thing a row can say about
  access is `disabled`, which is the platform's own deactivation: sessions end,
  outstanding links are retired, and everything that says who the person was
  survives. A removal in the source system maps to that.
- **A withdrawn account keeps its `sourceId`**, and a row naming it is refused
  (`account-withdrawn`) rather than obeyed.
- **A staff account is never a customer.** The refusal keys on the stored row's
  role, so a key or an address that resolves to an admin or a manager is a row
  error whatever the setting says.
- **What the account holder maintains, the exchange does not write**
  (FR-ADM-15): name and phone seed an account the run asks into being and are
  ignored on one that exists.

## Rationale

**A password in a feed is a password in a log.** It would sit in the sending
system's outbox, in whatever queue carries the run, and in the staged `rows` of
a run waiting for review — a column this repository already prunes for size
rather than for secrecy. The link the platform sends instead is single-use,
expiring, and addressed to the person rather than to the integration; nothing
in the exchange is ever able to sign in as a customer.

**A deletion the next run could undo is not a deletion.** If a removal upstream
cleared the row here, the account would be gone, its key with it — and the next
export that still mentioned the customer would meet somebody with no account,
create one, and mail a stranger an invitation to a shop they had left. Keeping
the key is what makes the refusal possible. It reads like the opposite of
erasure, and it is the reason erasure holds.

**The consequence to state plainly**: what FR-AUTH-06 produces is a closed and
cleared account, not anonymity — the row carries a key that the other system can
still resolve to a person. The privacy page should say withdrawn, not
anonymized.

**Deletion stops at the platform boundary.** A withdrawn account is reported
outward as withdrawn and the platform makes no claim about the source system's
own record: that system has its own retention obligations and the shop cannot
verify an erasure there. Claiming otherwise in a privacy notice would be
claiming something nobody here can check.

**Staff are carved out for the same reason the admin panel's closure carves them
out.** An admin who could not appoint another admin would have handed away more
than a customer list, and an exchange that could disable one could lock the
deployment out of its own panel with a mis-mapped key.

## Consequences

- (+) There is no state in which a customer's password exists and two parties
  know it, whatever an integration does.
- (+) A mis-mapped key in a feed can cost somebody their access, which a person
  can undo, and can never cost them their account, which nobody can.
- (−) An invitation costs a mail the platform sends, so a first import of
  several hundred customers mails several hundred people. The auto-apply
  ceiling for invites is low for exactly this reason: a run above it waits for
  somebody to look before anything is sent.
- (−) A customer whose relationship has ended stays in the account list as a
  disabled row rather than disappearing from it. That is the same outcome a
  manager's own deactivation produces, and the list already hides tombstones
  rather than the switched-off.
- (−) The source system's own account-state vocabulary has to be mapped to two
  values by the adapter. That mapping is the adapter's to state, which is where
  the rest of the format knowledge already lives (ADR 0054).
