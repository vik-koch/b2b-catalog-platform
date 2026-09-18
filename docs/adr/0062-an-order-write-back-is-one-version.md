# 0062 — An order write-back is one version, applied as it arrives

**Status:** accepted · **Date:** 2026-09-18

## Context

FR-ADM-08 lets a connected system work an order end to end: read the request out
of the shop, decide it over there, and write back what became of it — its state,
its content and what has been recorded against it — while the platform keeps the
customer's page and the customer's mail.

The platform already has three ways for a manager to answer an order, and they
are three separate acts on three separate screens: move it through the workflow
(FR-ORD-02), change what it says (FR-ORD-03), record that the money arrived
(FR-ORD-04). The first two each write a **version** of the order (ADR 0051), and
each asks the manager the same two questions — write to the customer? move their
page on? (FR-NOTIF-03).

An exchange polls. Between two polls, an order over there can have been accepted,
re-priced, and paid. Mapped one-for-one onto the admin panel's acts, that single
happening becomes three requests, three versions in the thread, and three answers
to the customer-mail question.

The other two exchange areas — the catalog (ADR 0055) and customers — also have a
**staging** rule: a run whose effect exceeds what the deployment permits
unattended waits for a person to apply it. The obvious symmetry would give orders
the same.

## Decision

- **One exchange writes at most one version.** A single instruction carries the
  status, the lines and the payment together, and they are written in one
  `appendRevision`.
- **At most**, because an instruction that says what the order already says
  writes nothing at all and mails nobody (FR-ADM-16), and because recording the
  money on its own writes no version — it never did, for a manager either.
- **`notify` and `showCustomer` are required on the wire**, with no defaults:
  they are the two questions a manager answers on every move, and an exchange
  answers them too.
- **Every instruction answers a `revisionNumber`** — the version the outbound
  read handed out. An instruction written against a version the order has moved
  past is refused (`order-changed`) rather than applied to something else.
- **A batch is one run, applied as it arrives, never staged.** One instruction
  failing refuses that order and no other.
- **A write-back may change the lines and nothing else of what the order says.**
  The contact, the party, the addresses and the fulfilment are carried across
  untouched, as are the customer's own note, their line notes and the day they
  asked for.
- **The version records a `source`**: the owning system's own name for whoever
  acted, or the credential's name where it named nobody. An opaque label, never
  resolved to an account here.
- **An order the customer called off is refused** (`order-called-off`), not
  driven forward.

## Rationale

**Three calls would be three events in a record of one.** The thread of versions
is the order's history and the customer reads part of it; an exchange that
accepted, re-priced and completed an order in one cycle would leave a history
saying those were three decisions taken in sequence, and — worse — would ask
three times whether to write to the customer, so the shop's own mail volume would
follow the polling cadence rather than the work.

**Staging is incoherent when the platform is not the reviewer.** The catalog and
the customer book have a person in this shop who is their fallback owner, so
"wait, somebody should look at this" is a real instruction. An order handed to an
external system has no such person: staging the answer would leave the customer
waiting on a decision nobody here is placed to take, and a source polling every
few minutes would file a run per cycle for somebody to read. The ceiling
mechanism has nothing to protect here either — what a run can do wrong is bounded
by the orders it names, not by a count of rows it might sweep.

**A batch is not a transaction, deliberately.** All-or-nothing would have a source
that could not answer three orders re-send the other forty to retry them — and
re-answer the forty on the way, which is only harmless because of FR-ADM-16 and
not something to rely on.

**Answering a version is what makes two writers safe.** Both sides can write: the
shop while an area is not owned, the exchange while it is, and the customer's own
cancellation at any time. The version number is the one fact that tells an
instruction whether the order it is answering is the order it read.

**The lines are what the other system decides.** Everything else on an order came
_from_ this platform — it is the customer's own answers to this shop's checkout,
which the exchange received in the outbound read. A write-back able to overwrite
the delivery address or the invoiced party would be answering the checkout on the
customer's behalf, and the platform would have no way to tell that from a
mis-mapped field.

**A name from another system is a string.** The shop cannot know whether an
"I. Petrov" over there is an account here, and matching one would put one
person's name on another's work. So it is stored as a label and shown as one.

## Consequences

- (+) An order worked entirely in the other system reads here as the same thread
  a manager would have written, at the same length.
- (+) A polling source may re-send freely: an unchanged instruction is a no-op
  that lengthens nothing and mails nobody.
- (+) The customer's own cancellation survives contact with the exchange, and the
  exchange is told it happened rather than driving over it.
- (−) The adapter has to collapse its own workflow onto the platform's coarse
  statuses and send one instruction per order per cycle. That mapping is the
  adapter's to state, where the rest of the format knowledge already lives
  (ADR 0054).
- (−) An order run cannot be reviewed, discarded or replayed from the panel. The
  log is a record, not a queue — which is why the panel's order-sync row carries
  no waiting count and the run page shows no buttons.
- (−) Correcting something the write-back may not touch — an address the customer
  gave wrongly — needs the area handed back, or the customer. That is the same
  boundary FR-ADM-10 draws everywhere else.
