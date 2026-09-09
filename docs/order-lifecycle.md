# The life of an order

An order is the one thing in this platform that two parties work on together
over days: the customer places it, the shop answers it, either side can end it,
and every step of that is something the other side has to be told about. The
rules for it are small and correct in isolation — a transition table, a payment
axis, a notification default — but no single file says what an order's life
looks like, and by the time three of them are involved nobody can hold it in
their head.

This document is that missing view. The tables and the diagram are generated
from `libs/shared/src/lib/order-transitions.ts` — the same functions the API
refuses a transition with and the admin panel draws its buttons from — so
nothing here can quietly stop being true. Run
`node tools/generate-order-lifecycle.mjs` after changing the rules; CI checks it.

Requirements: FR-ORD-01…06 (the states, the moves, adjustments, payment,
documents), FR-NOTIF-03/05/06 (what gets written to whom). Decisions:
[ADR 0050](adr/0050-order-status-and-payment-state.md),
[ADR 0051](adr/0051-order-revisions.md),
[ADR 0052](adr/0052-order-documents-generated-or-supplied.md).

## Two axes, not one

Where an order **stands** and what it **owes** are separate facts, and they have
to be: cash is handed over with the goods, so a single chain could not say that
an order is finished and paid at the same moment as it says it was completed.
Fulfilment moves through the states below. Payment is `not-due`, `awaiting` or
`paid`, and only two things change it — accepting an order makes an invoiced one
due, and a manager records the money arriving.

A third fact sits underneath both: an order is a **thread of versions**. Every
move writes one, every adjustment writes one, and what the customer's own page
shows is a version — not necessarily the newest. So an order carries two
positions at once, both always stated to staff: the version the customer can
see, and the version they were last written to about.

## Where an order can go

<!-- generated:order-diagram -->

```mermaid
stateDiagram-v2
  [*] --> requested
  requested --> approved: staff
  requested --> declined: with a reason
  requested --> cancelled: with a reason
  requested --> cancelled: customer calls it off
  approved --> ready: staff
  approved --> requested: undo
  approved --> cancelled: with a reason
  ready --> completed: staff
  ready --> approved: undo
  ready --> cancelled: with a reason
  completed --> ready: undo
  completed --> requested: undo
  declined --> requested: staff
  cancelled --> requested: staff
  completed --> [*]
```

<!-- /generated:order-diagram -->

Every move runs backwards as well as forwards, one step at a time, for one
reason: staff's undo. A click made by accident must not leave an order at the
wrong answer for good, and the only other recovery from `ready` clicked too
early would be to cancel the order — which tells the customer their order was
called off when it never was.

The two endings are off the chain. Reopening a declined or cancelled order does
not put it back where it was: there is no telling which step it ended from, so
it goes back to `requested` and is answered again from the start.

<!-- generated:order-states -->

| Where the order stands | A manager may move it to               | The customer may | Invoiced order owes |
| ---------------------- | -------------------------------------- | ---------------- | ------------------- |
| `requested`            | `approved` · `declined` · `cancelled`  | `cancelled`      | `not-due`           |
| `approved`             | `ready` · `requested` · `cancelled`    | —                | `awaiting`          |
| `ready`                | `completed` · `approved` · `cancelled` | —                | `awaiting`          |
| `completed`            | `ready` · `requested`                  | —                | `awaiting`          |
| `declined`             | `requested`                            | —                | `not-due`           |
| `cancelled`            | `requested`                            | —                | `not-due`           |

<!-- /generated:order-states -->

The last column is what an invoiced order owes before anyone records a payment.
A cash order is never `awaiting`: cash exists at the handover, which is a
manager recording a payment and not a transition at all.

## Every move

<!-- generated:order-moves -->

| Move                      | Who      | Direction | Reason   | Mail offered |
| ------------------------- | -------- | --------- | -------- | ------------ |
| `requested` → `approved`  | staff    | forward   | —        | ticked       |
| `requested` → `declined`  | staff    | forward   | required | ticked       |
| `requested` → `cancelled` | staff    | forward   | required | ticked       |
| `requested` → `cancelled` | customer | forward   | optional | n/a          |
| `approved` → `ready`      | staff    | forward   | —        | ticked       |
| `approved` → `requested`  | staff    | backward  | —        | unticked     |
| `approved` → `cancelled`  | staff    | forward   | required | ticked       |
| `ready` → `completed`     | staff    | forward   | —        | ticked       |
| `ready` → `approved`      | staff    | backward  | —        | unticked     |
| `ready` → `cancelled`     | staff    | forward   | required | ticked       |
| `completed` → `ready`     | staff    | backward  | —        | unticked     |
| `completed` → `requested` | staff    | backward  | —        | unticked     |
| `declined` → `requested`  | staff    | forward   | —        | ticked       |
| `cancelled` → `requested` | staff    | forward   | —        | ticked       |

<!-- /generated:order-moves -->

**Direction** is not about the chain so much as about intent: it answers
whether staff are undoing a click. A refusal reads as `forward` for that reason
— declining an order is an answer the shop is giving, not a step it is taking
back — and only a move to an earlier state on the chain is `backward`.

**Reason** is required only for the shop's two refusals. A refusal is quoted at
the customer, and being told no without being told why is the answer nobody can
act on; a customer calling off their own order owes the shop nothing, so there
the reason is asked and not imposed.

**Mail offered** is the state of the tick box, not what happens. Nothing is ever
sent without a manager asking for it. The box is ticked for news the customer
has not had — a step forward to a state they have never been written to about —
and cleared for everything else, which is the shop putting its own record
straight. The column above shows the default for a customer who has been told
nothing yet; a second pass through a state they already had a mail about is
offered unticked.

An **adjustment** is not on this table at all. Changing what an order says has
its own payload and no target status: an adjusted order stands exactly where it
stood, including after it has ended.

## What the customer receives

Every message the app can send is rendered in [docs/mail/](mail/) — both parts,
as the mailer sends them, from the demo wording. That gallery is the answer to
"what exactly does the customer get", and the subjects listed there are the
subjects the order-journey specs match on.

Three things decide which message a move produces: the status it lands on, the
notice (_moved_, _corrected_, _changed_), and whether the reader has an account.
An account holder is linked to their own order page; a guest gets the capability
token, which is their only record of the order.

## Journeys

An order's life is not one move but several, and the facts that matter most
only exist once they have accumulated: which version each side is on, what the
customer has already been written to about, whether a document filed two
versions ago still stands. The journeys below are walked against the running
API by `apps/api-e2e/src/api/order-journeys.spec.ts`, and this section is
rendered from the same literals — so nothing here is described that is not
checked, and nothing checked goes undescribed.

**A blank cell is an assertion.** Every step asserts the whole observable state,
not only what it names: a reading nobody mentions is asserted unchanged, and a
mail nobody declares is asserted not to have been sent. That is what makes the
two quiet steps below say something.

<!-- generated:order-journeys -->

### Delivered, invoiced, and paid on the doorstep

The whole forward chain for a signed-in customer, and the one journey that walks it end to end. Everything else starts partway along.

**The order.** A signed-in customer’s order, for delivery and invoiced to their company.

**Starting from.** It has just been placed.

**Which leaves it.** Where it stands: `requested`<br>What it owes: `not-due`<br>Version: 1<br>The version the customer is on: 1<br>Already written to about: `requested`

| #   | What happens                                                                   | Who     | What changes                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The manager checks the stock and accepts the order.                            | manager | Where it stands: `approved`<br>What it owes: `awaiting`<br>Version: 2<br>The version the customer is on: 2<br>Already written to about: `approved` · `requested`<br>Mail to the customer: `approved`                       |
| 2   | The order is packed, and the manager marks it ready.                           | manager | Where it stands: `ready`<br>Version: 3<br>The version the customer is on: 3<br>Already written to about: `approved` · `ready` · `requested`<br>Mail to the customer: `readyDelivery`                                       |
| 3   | It is handed over and paid for, which the manager records with the same click. | manager | Where it stands: `completed`<br>What it owes: `paid`<br>Version: 4<br>The version the customer is on: 4<br>Already written to about: `approved` · `completed` · `ready` · `requested`<br>Mail to the customer: `completed` |

### A step taken back, and taken again

What the customer is _not_ told. Walking a move back and repeating it must not write to them twice about a step they have already had — and must not make the genuinely new one quiet.

**The order.** The same order, already packed: accepted and marked ready, both announced.

**Starting from.** The manager accepts it. The manager marks it ready.

**Which leaves it.** Where it stands: `ready`<br>Version: 3<br>The version the customer is on: 3<br>Already written to about: `approved` · `ready` · `requested`

| #   | What happens                                                        | Who     | What changes                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ready` was clicked too early, so the manager walks it back a step. | manager | Where it stands: `approved`<br>Version: 4<br>The version the customer is on: 4                                                                                                                     |
| 2   | The order is genuinely ready, and the manager says so again.        | manager | Where it stands: `ready`<br>Version: 5<br>The version the customer is on: 5                                                                                                                        |
| 3   | It is handed over and completed.                                    | manager | Where it stands: `completed`<br>Version: 6<br>The version the customer is on: 6<br>Already written to about: `approved` · `completed` · `ready` · `requested`<br>Mail to the customer: `completed` |

<!-- /generated:order-journeys -->
