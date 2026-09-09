# 0051 — An order is a thread of versions

**Status:** accepted · **Date:** 2026-09-08

## Context

A manager confirming an order finds two ordinary things: a line the shop cannot
fill in full, and a price the catalog had wrong. They ring the customer, agree
what to do, and accept a different order from the one that was submitted. The
customer was quoted the reference on that call and holds a mailed link to the
order, so whatever happens next has to keep both.

Changes do not stop at acceptance. An address changes while the order is on a
van. A cash order turns out to have been paid by card at the door. A completed
order was recorded wrongly and has to be put right a week later. Requirements:
FR-ORD-01, FR-ORD-02, FR-ORD-03, FR-ORD-04, FR-NOTIF-03, FR-ACC-02.

The order row is a document of frozen snapshots — addresses, party, pickup
office, totals, shipment estimate, currency, tier — with a database check tying
line totals to their quantities.

Alternatives considered: editing the snapshot in place; cloning the order under
a new reference; a revision that the customer must accept or reject in the
platform; a second acceptance status for an order that was changed.

## Decision

- **`orders` keeps identity and workflow** — `reference`, `publicToken`,
  `userId`, the status a query filters by, and payment. **`order_revisions`
  keeps everything the order says**, status included, and the items hang off a
  revision.
- **Every version is a complete reading of the order at one moment.**
  Submission writes revision 1. **Every move writes one, and so does every
  change**, each saying which it was. The thread is therefore the order's whole
  history, and any point in it can be read back whole rather than reconstructed.
- **A change is not a move.** Adjusting an order leaves it exactly where it
  stood: a request that a manager corrects is still a request, and a packed
  order whose address changed is still packed.
- **An order can be changed wherever it stands**, ended and completed included.
  The screen warns where a change sits awkwardly with what the order already
  is — money recorded as paid, goods already out, an order that ended — and
  lets the manager proceed.
- **An adjustment may change everything the checkout asked** — lines, prices,
  fulfilment and where the order goes, the invoiced party, the payment method,
  the contact — and **nothing the customer wrote in their own words**: their
  note, their line notes and their preferred date travel with the order
  unedited. The manager's own account of the change is a note on the revision.
- **Prices are carried forward, never re-derived behind the manager.** A line
  nobody touched keeps the price it was quoted at, for good. A new line comes
  in at what the catalog charges the order's price list today, and re-pricing
  the order from another list is an action a manager takes deliberately —
  which is what a provisionally priced third-party order needs (FR-CART-09).
- **A pointer on the order says which version the customer's page reads**
  (`customerRevisionId`) — every customer read goes through it, and the thread
  itself stays a staff view. A change on its own does not advance it: a version
  nobody has explained to them is not theirs to see.
- **A move advances it unless the mover says otherwise.** Where the order
  stands is not a secret, and a page that lags it tells the person waiting the
  wrong thing — so the move carries a tick, offered ticked, and clearing it is
  for the step that should never have been taken: `ready` on the wrong order,
  put straight back. The mail hangs off that tick rather than beside it, since
  a message about a version the customer cannot open is a dead link.
- **A version that says what the one before it says is not written.** A note is
  an account of a change, not a change, and the refusal is the service's rather
  than the screen's: a system re-sending an order it has already sent must not
  lengthen the thread by doing so.
- **What they were _told_ is a different question, answered by the thread**:
  the newest version stamped `notifiedAt`. One fact, one place — a second
  pointer for it would be free to disagree with the stamps that produced it.
- **What still owes them a word** is read off the same thread: their page is
  showing them a version no message announced, or a change is sitting above the
  version they hold with nothing having mentioned it yet. A move held off their
  page is neither — it is a step the shop took back, and asking somebody to
  explain it would be asking them to announce a mistake.
- **The mail is asked for, never inferred.** Every move and every adjustment
  carries a "write to them" flag, offered ticked wherever the move is news they
  have not had — a step forward into a state no message has announced — and
  clear for a step back or a second pass through a state they already know
  about. One mail carries the order as it then stands and everything the shop
  said it changed since the last one. Where a manager skipped it, one button on
  the one row that says so sends it afterwards.
- **The money can be recorded with the move that is the handover.** Completing
  a cash order and marking it paid is one event; a manager should not have to
  say it twice. Offered ticked for cash, clear for the invoiced methods, and
  refused on a move that ends an order.
- **Staff move an order backwards a step as well as forwards**, and reopen an
  ended one to `requested`.
- **Agreement happens on the phone; the platform records it.** There is no
  accept/reject step for the customer.
- **A version records whether the customer was written to about it**
  (`notifiedAt`), the submission included: the receipt is a message about
  version 1. The pointer says which version they are looking at; this says
  which ones put something in their inbox, and the two are not the same
  question — a version can become theirs without a mail going out.
- **A version has an address of its own**, read back on a staff screen that
  shows exactly what the customer sees, with the facts only the shop has beside
  it. Answering the order is a different screen: reading a version and changing
  one are different jobs.

## Rationale

**The reference and the link must survive.** Cloning under a new reference
breaks a number the customer read out loud and a link they were sent, which is
the one thing an order request has to keep stable.

**In-place editing makes the record disagree with itself.** The mail the
customer holds, a generated PDF and the screen would each show a different
order with no way to say which was ever true.

**A second acceptance status is the wrong axis.** An `adjusted` status beside
`approved` fails in three places at once: adjusting a request would silently
accept it, an order already packed needs a special case because it cannot
become `adjusted`, and "was this changed" gets two answers — the status and the
version number — free to disagree. The version number is the honest one, so the
status is not worth having.

**Status belongs on the version, once every move writes one.** It is what lets
a customer be shown the order as they were last told it stood while staff work
on a later version, with no screen assembling a reading from two places. The
cost is a row and a copy of the lines per move, on orders of a few lines that
move three or four times.

**Throttling the mail, not the change, is what makes changes cheap.** A shop
that has to weigh "will this email them?" before correcting an address will
leave the address wrong. Because a change carries its own flag, the ordinary
sequence — change agreed on the phone, then confirmed — sends one mail saying
both, and the correction nobody needs to hear about sends none.

**A tick beats a rule that guesses.** A rule that decides for itself when to
write — freezing the customer's pointer once they have been told the order
ended, say — is right about the case it was written for and wrong elsewhere: a
step back mails wording that announces a step forward, and an order reopened
for a real reason goes silent for the rest of its life. The mail is the one
thing on that screen nobody can take back, so it is asked; and because the
default is computed from what the customer has actually been told, the quiet
case stays quiet without a rule that has to be right about everything.

**One control per thing that reaches the customer.** A move decides two
separate things about them — what their page says, and what lands in their
inbox — and a single tick for both forces a choice nobody should have to make:
either every quiet correction of a mis-click is announced, or an order out for
delivery keeps reading "confirmed" because one mail was thought to be enough.
They are nested rather than independent because only one order of the two makes
sense: a page can move without a message, a message cannot be sent about a page
that has not.

**Read what is owed against what they are shown, not against the newest
version.** Measuring against the newest asks the shop to explain versions it
deliberately kept from them, which is a flag that can never be cleared and,
once an exchange is writing intermediate steps back, is every order in the
list. A change is the exception, because a change sits above the pointer until
something mentions it: that one is genuinely pending, and it is the case the
"tell them" button exists for.

**A pointer that means two things eventually has to choose.** Once the mail is
a decision per move, "what they see" and "what they were told" come apart: a
manager who confirms an order without writing to them has not made the order
secretly still unanswered. So the pointer keeps the first meaning and the
thread's `notifiedAt` answers the second.

**Refusing a change is worse than warning about one.** Paid, ready, completed
and ended are all states a shop legitimately corrects an order in, and the
platform records what the shop did rather than deciding what it may do — the
same argument that made recording a payment undoable.

**A step back is not a cancellation.** Without backward moves, the only way to
undo "ready" clicked too early is to cancel the order and reopen it, which
tells the customer their order was called off when it never was.

**Customer approval in the platform would be a feature nobody uses.** This shop
settles changes by phone; a pending-approval state would sit unanswered while
the goods are already being packed.

## Consequences

- (+) An order can be rewritten without being replaced: the reference the
  customer was quoted and the link they were mailed keep working while the
  contents change under them, so a shop corrects an order where it would
  otherwise cancel and re-enter it.
- (+) The history reads back whole. Any point in the thread is a complete
  order, not a reconstruction from an audit trail, which is what answers "what
  did we send them?" on a support call and what a corrected order needs to be
  auditable at all.
- (+) The order PDF is generated from a version, so a document regenerated
  later cannot quietly differ from the one that was sent.
- (+) An integration that moves or adjusts an order upstream (iteration 12) has
  one place to put the result, and the customer's pointer decides on its own
  which of its updates are worth a mail.
- (+) "Was this order changed" has exactly one answer, and no status can drift
  out of step with it.
- (−) The snapshot columns move off `orders` into `order_revisions`, and every
  order read gains a join. It is a data migration of shipped rows that applies
  unattended, so a minor release.
- (−) **A move now writes a row and copies the order's lines.** Every
  transition and every adjustment duplicates the whole snapshot: one
  `order_revisions` row (the addresses, the party, the contact, the totals —
  on the order of 0.5–1 kB) plus one `order_items` row per line (the product
  reference, its name and unit snapshot, the prices and the customer's note —
  on the order of 0.2–0.4 kB). A five-line order walked from request to
  completion has four versions and twenty item rows: roughly 8–10 kB where an
  unversioned order would be 2–3 kB. At a few thousand orders a year that is
  tens of megabytes — smaller than the product images of one catalog page, and
  it buys a history that reads back whole. It is a per-move cost and not a
  per-read one: a screen reads one revision through a join, never the thread,
  unless it asked for the thread. What would change the arithmetic is an
  integration that moves orders on a schedule, or an order of hundreds of
  lines; if either arrives, the answer is to stop copying items for a move
  that changed no line and point the new revision at the old rows — which the
  schema allows without a migration, since items hang off a revision id.
- (−) A customer can be looking at a version the order has moved past — a
  change nobody has told them about. The staff screen and the customer's screen
  then legitimately disagree, and the staff screen has to say so.
- (−) The mail is now a per-move decision, so it can be forgotten. The screen
  answers it in advance and the "they have not been told" row is what catches
  the case where somebody unticked it and meant not to; nothing else does.
- (−) A move kept off the customer's page is not flagged anywhere, by
  construction — that is what makes the flag mean something. A manager who
  clears the tick out of habit leaves a page saying less than the order does,
  and only reading the thread would show it.
- (−) Staff see the whole thread; customers see one version, with a note that
  it changed. The version they were sent stays in their inbox rather than in
  the UI, which is a deliberate limit and not a hidden one.
- (−) An adjustment can leave an order saying something odd — paid, but for a
  total nobody has paid yet. The screen warns; nothing reconciles it, because
  reconciling money is not this platform's job.
- (−) Payment stays on the order rather than on the version, so a superseded
  version reads back with today's money beside its own contents. That is the
  honest answer for a fact about the present — what an order owes is not a
  property of what it said last Tuesday — but it does mean a version is not
  _entirely_ a reading of one moment, and a payment record leaves no mark on
  the thread. The audit log carries it (ADR 0050). If an integration ever has
  to exchange payment history, the answer is a version written for it, which
  the schema already allows.
