# The order exchange

This document is the third companion to [the automated catalog
feed](catalog-sync.md) and [the customer exchange](customer-sync.md), and
exists for the same reason: what happens when an external system works the
shop's orders is spread across a run log, an ownership switch, a thread of
versions, a set of mail templates and the customer's own order page, none of
which says on its own what the customer actually experiences.

What follows is the logic **as it currently stands**, not the thinking behind
it. The reasoning lives in the ADRs; the requirements live in
`requirements.md`. What to actually send over the wire — routes, instruction
fields, error codes, what each one causes — is [the order machine
API](order-machine-api.md). How the three exchanges differ from one another is
[the comparison](exchange-areas.md).

Requirements: FR-ADM-08 (the exchange itself), FR-ADM-10 (an external system
owning the area), FR-ADM-09 (the log), FR-ADM-16 (an instruction that repeats
itself), FR-ORD-01 (the states), FR-ORD-02 (moving between them), FR-ORD-03
(versions and adjustments), FR-ORD-04 (payment), FR-ORD-05 (documents),
FR-NOTIF-03 (whether the customer hears), FR-NOTIF-09 (what the shop is told),
NFR-SEC-09 (the credential), NFR-LEGAL-07 (what the privacy page has to say).
Decisions: [ADR 0050](adr/0050-order-lifecycle-and-payment-as-separate-facts.md),
[ADR 0051](adr/0051-an-order-is-a-thread-of-versions.md),
[ADR 0052](adr/0052-order-documents-generated-or-supplied.md),
[ADR 0053](adr/0053-machine-tokens-for-automated-clients.md),
[ADR 0056](adr/0056-an-external-owner-makes-fields-read-only.md),
[ADR 0060](adr/0060-the-exchange-is-area-scoped.md),
[ADR 0062](adr/0062-an-order-write-back-is-one-version.md).

## The one rule the rest follows from

**One exchange writes at most one version of an order.**

Where the admin panel has three buttons — move it, change it, record the money
— the exchange has one instruction carrying all three. An order that was agreed
on the phone, accepted at the new figure and paid for between two polls is
**one** thing that happened to it, and filing it as three would triple the
thread the customer reads and ask them the "shall we write to you" question
three times over.

Two consequences follow immediately, and most of this document is one of them.

An instruction that says what the order already says writes **nothing**
([FR-ADM-16](requirements.md#fr-adm-16)). A polling source cannot remember what
it sent, so re-sending is its normal behaviour rather than a fault — and the
answer to it is `unchanged`, reported and not refused.

And an instruction has to name the version it answers. The order may have moved
since the source read it — the customer may have called it off — so an
instruction written against the version before is refused with what it is,
rather than applied to facts that have changed underneath it.

## What a run can become

A batch is **one run, applied as it arrives**. That is the one place this area
departs from the other two, and it follows from what is being written: a
catalog or a customer run can wait for a person because a person here is the
fallback owner of that data, while the premise of this arrangement is that the
platform is **not** the reviewer. Staging an answer to an order would leave a
customer waiting on a decision nobody in this shop is placed to take, and a
source polling every few minutes would file a run per cycle for somebody to
read.

| Status      | What it means                                                                   |
| ----------- | ------------------------------------------------------------------------------- |
| `applied`   | It wrote something, or refused something. Terminal on arrival.                  |
| `no change` | Every instruction in it said what the orders already said. Terminal on arrival. |
| `failed`    | The source reported that it broke before it produced anything.                  |

`waiting`, `discarded` and `superseded` cannot occur here at all: there is no
moment at which an order run exists and has not happened yet. The admin panel's
order-sync screen is therefore a log with no buttons on it.

**One instruction failing never fails the batch.** A run that could not answer
three orders and wrote forty is a run that wrote forty — an all-or-nothing
batch would have the source re-send the lot to retry three, and re-answer the
forty on the way. Each refusal is filed against its own instruction, with a
code and the values from the sending system's own data.

## Who holds the pen

Every **write** is refused unless order processing is externally owned
([FR-ADM-10](requirements.md#fr-adm-10)), and while it _is_ owned the mirror
holds: staff transitions, adjustments, payment recording and document uploads
are all refused in the admin panel. Exactly one side answers the shop's orders
at a time, and the switch is an admin's to flip without a deploy.

The **read** is not gated by it at all
([FR-ADM-08](requirements.md#fr-adm-08)). A system has to see the orders that
are here before anybody can decide to hand the work over, and a read carries no
instruction that could collide with the shop's own. What gates it is the
credential an admin issued, which is the "configured rather than assumed"
[NFR-LEGAL-07](requirements.md#nfr-legal-07) asks for.

Two things stay open however the area is owned, and both are the customer's:

**Placing an order.** The storefront keeps taking orders, so an owned area
still acquires work — which is the point of the arrangement rather than an
oversight in it.

**Calling one off.** A customer may cancel an order nobody has answered yet
([FR-ORD-02](requirements.md#fr-ord-02)), and no setting takes that from them.
For the exchange this is not a conflict to resolve but a fact to read: an
instruction arriving for an order they called off is **refused** rather than
driving it forward over the top. The alternative is a cancellation that
silently never happened, and a customer watching an order ship after they
stopped it.

## What the exchange cannot do

**Write a version that is not an answer about the order.** What the customer
wrote in their own words — their note, their line notes, their preferred date —
is theirs, exactly as it is when a manager adjusts an order. A write-back may
change what the order contains and what it costs; everything else on it came
_from_ here and is the customer's own answer to the shop's checkout.

**Move an order somewhere a manager could not.** The transition table is the
same one ([FR-ORD-01](requirements.md#fr-ord-01),
[FR-ORD-02](requirements.md#fr-ord-02)): a move it does not allow is refused
whoever asks. The platform's states stay the coarse set, and however many steps
an order passes through in the other system, the customer reads the one that
concerns them.

**Act as a person.** A version an exchange writes is authored by the
integration. Where the other system knows who acted, that name travels as an
opaque label and is never resolved to an account here — the shop has no way to
know whether a matching name is the same human being, and guessing would put
one person's name on another's work.

**Redraw the shop's paperwork.** What the back office prints is a real document
with the shop's own layout on it, and it arrives as **bytes**
([FR-ORD-05](requirements.md#fr-ord-05), ADR 0052). Supplying one writes no
version and files no run. The adapter's ordering rule is to supply the file
_before_ the version that announces it, so one message carries both.

**Delete an order.** Nothing here removes one. A refused or called-off order
keeps its record and states a reason, which the customer is told.

**Reach anything while nobody has handed the area over.** The machine route is
refused with `orders-not-externally-owned` — the exact mirror of the refusal
the admin panel meets while the area _is_ owned.

## What the shop is told, and when

Two messages, both sent on a **change of state** rather than on a run, and both
worded about orders rather than about the catalog or the accounts
([FR-NOTIF-09](requirements.md#fr-notif-09)):

| Message                                              | Sent when                                         | To                                                        |
| ---------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| [`orderSyncFailed`](mail.md#order-sync-failed)       | The first failure after the exchange was working. | The admin, and the operator where a deployment names one. |
| [`orderSyncRecovered`](mail.md#order-sync-recovered) | The first run that goes through after a failure.  | The same readers.                                         |

There are two rather than the other areas' three or four, and both absences are
the same fact: nothing an order run does can wait for a person, so there is no
"a run is waiting for you" message — and nothing it brings lands on anybody's
desk, so there is no counterpart to the catalog's "new products arrived".

What the **customer** is told is decided per instruction, exactly as a manager
decides it per move ([FR-NOTIF-03](requirements.md#fr-notif-03)): `notify` says
whether a message goes out, `showCustomer` whether their own page moves on to
the new version. Neither has a default on the wire — a default would quietly
decide for the shop how loud its own mail is.

Each area's state is read against **its own** last run, so a broken catalog
feed and a working order exchange are two independent facts: neither announces
the other's recovery, and neither suppresses the other's failure.

## The journeys

These are walked against a running API by `order-sync-journeys.spec.ts` and
printed from the same literals. Order processing is handed over for the length
of every one of them, so nothing below could have come from the admin panel.

A cell that says nothing is not a gap: every step asserts the whole observable
state, so an unmentioned reading is asserted _unchanged_ and an unmentioned
message is asserted not to have been sent — which is most of what these
journeys are for.

<!-- generated:order-sync-journeys -->
<details>
<summary><b>An order worked entirely in the other system</b> — The ordinary case, end to end, with nobody here touching it. What it is really about is the invoice: the shop’s own paperwork arrives as bytes before the version that announces it, so one message carries both — and until the order owes money, the customer is not offered it at all.</summary>

**The order.** A signed-in customer’s order, for delivery and invoiced to their company, placed while the back office owns order processing.

**Starting from.** The order as the customer placed it, unanswered.

**Which leaves it.** The order: `requested`<br>Payment: `not-due`<br>Version: 1<br>The customer’s version: 1<br>What the source reads: `requested @ 1`<br>The customer’s documents: `order-summary`

| #   | What happens                                               | Who    | What changes                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The source polls for orders and finds this one.            | system | —                                                                                                                                                                                                                                                                                                                                                               |
| 2   | The back office prints the invoice and posts it as a file. | system | —                                                                                                                                                                                                                                                                                                                                                               |
| 3   | It accepts the order and says so.                          | system | The run: `applied`<br>What the instruction did: `transition`<br>The order: `approved`<br>Payment: `awaiting`<br>Version: 2<br>The customer’s version: 2<br>What the source reads: `approved @ 2`<br>The customer’s documents: `order-summary` · `payment-instructions`<br>Mail to the customer: [`approved+attached`](mail.md#order-approved-with-instructions) |
| 4   | The transfer arrives and the back office records it.       | system | The run: `applied`<br>What the instruction did: `payment`<br>Payment: `paid`                                                                                                                                                                                                                                                                                    |
| 5   | It is packed over there, and the order is marked ready.    | system | The run: `applied`<br>What the instruction did: `transition`<br>The order: `ready`<br>Version: 3<br>The customer’s version: 3<br>What the source reads: `ready @ 3`<br>Mail to the customer: [`readyDelivery`](mail.md#order-ready-delivery)                                                                                                                    |
| 6   | It is delivered, and the order is completed.               | system | The run: `applied`<br>What the instruction did: `transition`<br>The order: `completed`<br>Version: 4<br>The customer’s version: 4<br>What the source reads: `completed @ 4`<br>Mail to the customer: [`completed`](mail.md#order-completed)                                                                                                                     |

</details>

<details>
<summary><b>Moved, re-priced and paid in one exchange</b> — The rule the area is built on (ADR 0062). An order that was agreed on the phone, accepted and paid between two polls is one event to the customer — one version, one message — and not three. The re-send after it is the other half: a polling source that cannot remember what it sent writes nothing at all.</summary>

**The order.** The same kind of order, and a source that has already read it once.

**Starting from.** The source reads the order.

**Which leaves it.** The order: `requested`<br>Version: 1<br>The customer’s version: 1

| #   | What happens                                                                                                                                 | Who    | What changes                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Half the quantity is agreed on the phone; the back office accepts the order at the new figure and records the transfer that arrived with it. | system | The run: `applied`<br>What the instruction did: `adjustment`<br>The order: `approved`<br>Payment: `paid`<br>Version: 2<br>The customer’s version: 2<br>What the source reads: `approved @ 2`<br>Mail to the customer: [`changed`](mail.md#order-changed) |
| 2   | The next poll cycle sends the very same instruction again.                                                                                   | system | The run: `no change`<br>What the instruction did: `unchanged`                                                                                                                                                                                            |
| 3   | A second exchange, prepared before the first one landed, answers the version the order used to stand at.                                     | system | The run: `applied`<br>What the instruction did: `refused: order-changed`                                                                                                                                                                                 |
| 4   | It re-reads the order and answers the version it now stands at.                                                                              | system | —                                                                                                                                                                                                                                                        |
| 5   | And marks it ready.                                                                                                                          | system | The run: `applied`<br>What the instruction did: `transition`<br>The order: `ready`<br>Version: 3<br>The customer’s version: 3<br>What the source reads: `ready @ 3`<br>Mail to the customer: [`readyDelivery`](mail.md#order-ready-delivery)             |

</details>

<details>
<summary><b>Called off while the other system was working it</b> — The one move a customer keeps however the area is owned (FR-ADM-10), and the one an exchange must never drive over the top of. A cancellation is not a conflict for the source to resolve — it is a fact it has to read.</summary>

**The order.** The same kind of order, read once by the source.

**Starting from.** The source reads the order.

**Which leaves it.** The order: `requested`<br>Version: 1<br>What the source reads: `requested @ 1`

| #   | What happens                                                   | Who      | What changes                                                                                                |
| --- | -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | The customer calls the order off, saying why.                  | customer | The order: `cancelled`<br>Version: 2<br>The customer’s version: 2<br>What the source reads: `cancelled @ 2` |
| 2   | The back office, which read it before that, accepts the order. | system   | The run: `applied`<br>What the instruction did: `refused: order-changed`                                    |
| 3   | It re-reads the order.                                         | system   | —                                                                                                           |
| 4   | And, still holding a picking list for it, tries again.         | system   | The run: `applied`<br>What the instruction did: `refused: order-called-off`                                 |

</details>

<details>
<summary><b>An order the other system cannot fill</b> — The refusals that are about the order rather than about the exchange: a move that owes the customer an answer and was sent without one, and money recorded against an order that ended. Each of them skips its own instruction and no more — a batch that refused three orders and wrote forty is a run that wrote forty.</summary>

**The order.** The same kind of order, read once by the source.

**Starting from.** The source reads the order.

**Which leaves it.** The order: `requested`<br>Version: 1

| #   | What happens                                                  | Who    | What changes                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The back office declines the order, saying nothing about why. | system | The run: `applied`<br>What the instruction did: `refused: reason-required`                                                                                                                                                              |
| 2   | It sends the same instruction with the reason on it.          | system | The run: `applied`<br>What the instruction did: `transition`<br>The order: `declined`<br>Version: 2<br>The customer’s version: 2<br>What the source reads: `declined @ 2`<br>Mail to the customer: [`declined`](mail.md#order-declined) |
| 3   | A stray instruction records a payment against it anyway.      | system | The run: `applied`<br>What the instruction did: `refused: payment-not-recordable`                                                                                                                                                       |

</details>

<details>
<summary><b>An exchange that breaks, stays broken, and comes back</b> — What the shop is told about the connection itself (FR-NOTIF-09), and what it is deliberately not told twice. An order exchange has two of these messages and not four: nothing it sends can wait for a decision, so there is nothing to announce and nothing to review.</summary>

**The order.** The same kind of order, and a source that reports its own breakage rather than going quiet.

**Starting from.** The source reads the order.

**Which leaves it.** The order: `requested`<br>Version: 1

| #   | What happens                                                    | Who    | What changes                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The nightly export breaks before it produces anything.          | system | The run: `failed`<br>Mail to the shop: [`orderSyncFailed`](mail.md#order-sync-failed)                                                                                                                                                                                                                                                    |
| 2   | It breaks again twenty minutes later.                           | system | The run: `failed`                                                                                                                                                                                                                                                                                                                        |
| 3   | The connection is fixed, and the back office accepts the order. | system | The run: `applied`<br>What the instruction did: `transition`<br>The order: `approved`<br>Payment: `awaiting`<br>Version: 2<br>The customer’s version: 2<br>What the source reads: `approved @ 2`<br>Mail to the customer: [`approved`](mail.md#order-approved)<br>Mail to the shop: [`orderSyncRecovered`](mail.md#order-sync-recovered) |

</details>
<!-- /generated:order-sync-journeys -->

### What the columns mean

<!-- generated:journey-legend -->

- **The run** — What became of the batch as a whole: `applied` where it wrote something, `no change` where every instruction in it said what the orders already said, or `failed` where the source reported that it could not run. There is no `waiting` here — an order run is never staged (ADR 0062), so `discarded` and `superseded` cannot happen either.
- **What the instruction did** — The answer to this journey’s own order, from the batch’s reply: `transition` where only its status moved, `adjustment` where its content did, `payment` where neither did and the money was recorded, `unchanged` where it already said what it was told, or `refused: <code>` where the exchange could not answer it. One refusal never fails the batch, which is why it is a reading of the instruction rather than of the run.
- **The order** — Where the order stands, read from the admin panel — which stays readable while an external system owns the area (FR-ADM-10) even though every button on it is refused.
- **Payment** — The second axis (FR-ORD-04): `not-due` while nobody has answered the order, `awaiting` once accepting it made the money owed, `paid` once it arrived. An exchange records it in the same breath as a move, and it is the one thing a write-back can say that writes no version at all.
- **Version** — Which version the order stands at (FR-ORD-03, ADR 0051). The reading the whole area turns on: **one exchange writes at most one version**, so an instruction that moved an order, re-priced it and recorded its money moves this by exactly one.
- **The customer’s version** — Which version the customer’s own page is showing. It follows the newest one only where the instruction said `showCustomer` — the same decision a manager makes on every move (FR-NOTIF-03), which a polling exchange has to make too.
- **What the source reads** — The order as `GET /machine/orders/{reference}` reports it — its status and the version a write-back must answer. Read through the credential rather than through a session, and never gated on ownership (FR-ADM-08): a source whose writes are being refused can still see what it is being refused about.
- **The customer’s documents** — What the customer may open on the order (FR-ORD-05). A file supplied over the machine endpoint arrives as bytes and is offered to them only once their own view has reached the version it was filed against — which is why the adapter supplies it _before_ the version that announces it.
- **Mail to the customer** — What arrived in the customer’s inbox at this step, named by the message it is. An exchange answers the notify question per instruction, so an empty cell is asserted and is most of what these journeys are about.
- **Mail to the shop** — What the people running the shop were told about the exchange itself (FR-NOTIF-09), sent on a change of state. Two messages only — it broke, it is working again — because an order run is never staged and so never waits for anybody’s decision.

<!-- /generated:journey-legend -->
