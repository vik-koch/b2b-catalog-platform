# The order machine API

The wire-level reference for whoever writes the system on the other end of the
order exchange — an ERP adapter, a back-office connector, a scheduled poller.

It is the third of these, beside [the catalog machine
API](catalog-machine-api.md) and [the customer machine
API](customer-machine-api.md), and the counterpart of [the order
exchange](order-sync.md), which explains what the platform does with a run and
why. This file says what to send, what comes back, and what each of those
causes. Where the two overlap, the exchange document has the reasoning and this
one has the shape. For how the three areas differ from one another, see [the
comparison](exchange-areas.md).

Requirements: FR-ADM-08, FR-ADM-09, FR-ADM-10, FR-ADM-16, FR-ORD-01,
FR-ORD-02, FR-ORD-03, FR-ORD-04, FR-ORD-05, FR-NOTIF-03, FR-NOTIF-09,
NFR-SEC-09, NFR-LEGAL-07.

---

## 1. Credentials and prerequisites

Identical to the other two areas — [§1 of the customer machine
API](customer-machine-api.md#1-credentials-and-prerequisites) is the full
account. In short:

- `Authorization: Bearer <prefix>.<secret>`, from a token an admin issued in
  the panel. Shown once, never expires, revoked immediately on request.
- Base URL `/api`; 60 requests per minute per client IP across the machine
  routes; refusals carry a top-level `code` — match on it, never on `message`.
- `GET /api/machine/token` → `{ name, scopes }` to check the credential at boot.

**Two scopes, deliberately separate.** An adapter being brought up holds
`order-read` for weeks before anybody grants it `order-sync`.

| Scope        | Grants                                                            |
| ------------ | ----------------------------------------------------------------- |
| `order-read` | reading the order book (§2)                                       |
| `order-sync` | writing orders back (§3) **and** filing the shop's documents (§4) |

Filing an invoice is not a third capability: a credential trusted to say an
order is confirmed is trusted to say what its invoice looks like, and a
separate box would be one more thing to tick for a decision nobody makes
separately.

**Ownership switch.** Every _write_ in this area — the write-back and the
document routes alike — is refused unless an admin has handed order processing
over to an external system (FR-ADM-10). Until then those routes answer **409
`orders-not-externally-owned`**. While the area _is_ owned, the mirror holds:
the admin panel's own transitions, adjustments, payment ticks and document
uploads are refused with `orders-externally-owned`. Exactly one side answers
the shop's orders at a time.

**The read is not gated by it.** That is the point of the read: the ERP has to
see what is here before anyone decides to hand the work over, and a read cannot
collide with anything.

**Two things stay open however the area is owned**, and both are the
customer's: placing an order, and calling off one nobody has answered yet. So
an owned area keeps acquiring orders, and keeps losing them to cancellations —
neither is a conflict for you to resolve, and both are facts to read (§2, and
`order-called-off` in §3.4).

| Code                          | Status | Meaning                                   |
| ----------------------------- | ------ | ----------------------------------------- |
| `not-authenticated`           | 401    | missing, unknown or revoked token         |
| `insufficient-scope`          | 403    | valid token, wrong capability             |
| `orders-not-externally-owned` | 409    | nobody handed the area over (writes only) |
| `invalid-cursor`              | 400    | a cursor this endpoint did not issue      |
| `order-not-found`             | 404    | no order of that reference                |

---

## 2. Reading orders out — `GET /api/machine/orders`

Scope: `order-read`. Not gated on ownership.

### Query

| Param    | Meaning                                                            |
| -------- | ------------------------------------------------------------------ |
| `since`  | ISO 8601; orders whose `updatedAt` is **at or after** this instant |
| `cursor` | `nextCursor` from the previous page, verbatim                      |
| `limit`  | 1–50, default 50                                                   |

Ordering is `updatedAt ASC, id ASC` — the order's **last change**, not
when it was placed. A puller walking creation order would have to re-read the
whole book to notice that yesterday's order was cancelled this morning.

### Response

```jsonc
{
  "orders": [
    {
      "reference": "2026-000431",     // what a write-back addresses; survives every version
      "status": "requested",          // requested | approved | ready | completed | declined | cancelled
      "paymentState": "not-due",      // not-due | awaiting | paid
      "revisionNumber": 1,            // the version you are reading — quote it back
      "customer": {                   // null on a guest order
        "accountId": "8f2c…",         // the platform's own id (FR-ADM-18 hands out the same one)
        "sourceId": "K-1042"          // your key, or null if the account has none yet
      },
      "contact": { "name": "…", "email": "…", "phone": "…" },
      "party": { "name": "Kontor GmbH", "registrationId": "DE123456789" },
      "fulfilmentMethod": "delivery", // delivery | pickup
      "paymentMethod": "bank-transfer",
      "deliveryAddress": { … },       // null on a pickup
      "pickup": { … },                // null on a delivery
      "billingAddress": { … },        // null where the deployment invoices no address
      "preferredDate": "2026-03-04",  // a wish, never a promise
      "customerNote": "…",            // theirs; a write-back never overwrites it
      "statusReason": null,           // set on declined and cancelled only
      "note": null,                   // what the shop said about this version
      "tierKey": "wholesale",         // null = the default price list
      "lines": [
        {
          "productSourceId": "K-88120", // your catalog key; there is no article number here
          "name": "…",                  // as it read when the order was placed
          "unit": "pack",               // the reading it was bought through…
          "quantity": 2,                // …and the figure in that reading
          "pieces": 20,                 // the quantity. Price and everything else is per piece
          "priceMinor": 200,
          "lineTotalMinor": 4000,
          "note": null
        }
      ],
      "totalMinor": 4000,
      "currency": "EUR",
      "createdAt": "2026-…",
      "statusChangedAt": "2026-…",
      "paidAt": null,
      "updatedAt": "2026-…"           // what `since` and the ordering are measured on
    }
  ],
  "nextCursor": "eyJ…"                // null at the end of the list
}
```

Each order reads as the version it **currently stands at**, whole — not a
header you then assemble from somewhere else. Superseded versions are not
offered: what you work is the order as it stands, and its history is the shop's
record of how it got there.

### Paging, and how to resume across runs

- Inside one sweep: follow `nextCursor` until it is null. The cursor is opaque;
  do not parse it, and do not carry it across runs.
- Between runs: remember the **last order's own `updatedAt`** and send it back
  as `since`. `since` is inclusive, so you will re-read the boundary rows; make
  your ingest idempotent rather than shaving a microsecond off.
- `invalid-cursor` is a hard error on purpose, rather than a silent restart
  from the top.

### The rows that matter to an adapter

**`customer: null`** — a guest order. There is no account behind it, and the
contact and party on the order are all there has ever been of that customer.

**`customer.sourceId: null`** — the account was registered on the storefront
and nothing outside has claimed it yet (FR-ADM-17). The order still has to go
somewhere: match it by `accountId`, which is the same handle the customer read
hands out, and claim the account by that id when you are ready.

**`status: "cancelled"`** — the customer called it off, which they may do
however the area is owned. Stop working it. A write-back naming it is refused.

**`pieces` is the quantity; `unit` and `quantity` are a reading.** A line of
two packs of ten is `pieces: 20`, and the price is per piece. Never derive
anything from `unit`/`quantity` — they are frozen as the line was shown, and a
line read as boxes stays `0.2 bx` after the product is repacked.

### 2.1 One order, fresh — `GET /api/machine/orders/{reference}`

→ 200 with one order object, exactly as above. → 404 `order-not-found`.

It exists for the moment you most need it: a write-back refused for naming a
version the order has moved past (§3.4, `order-changed`). Walking the whole
feed again to find out what it moved to is a poor answer to "what does it say
now".

---

## 3. Writing orders back — `POST /api/machine/sync/orders/runs`

Scope: `order-sync`. Refused unless the area is owned. → **201** with
`{ run, plan }`.

Body limit 10 MB, instruction cap 50 000.

### 3.0 The rule the rest follows from

**One exchange writes at most one version of an order.** Where the admin panel
has three buttons — move it, change it, record the money — this has one
instruction carrying all three. An order that was accepted, re-priced and paid
between two of your polls is one event to the customer, not three, and sending
it as three would triple their thread and ask them the notification question
three times.

**A batch is one run, applied as it arrives.** Nothing here is ever staged, so
there is no `previewed`, no commit route and nothing to poll for a decision.
And **one refused instruction never fails the batch**: a run that refused three
orders and wrote forty is a run that wrote forty.

### 3.1 Request body

```jsonc
{
  "orders": [ … ],            // 1–50 000 instructions, one per order
  "label": "orders-write-back", // optional, ≤ 200 chars — what the log calls this run
  "actor": "M. Weber",          // optional, ≤ 200 chars — see below
  "notice": "…"                 // optional, ≤ 500 chars — kept verbatim beside the run
}
```

There are deliberately **no options** and **no `requestReview`**: every other
area has a run-wide intent to declare, and here each instruction says what it
does; and nothing can be staged, so asking to be doubted would be asking for
something the area cannot do.

`actor` is an **opaque label**. It is written beside the versions this run
produces and never resolved to an account here — the person named is a user of
_your_ system, and matching a name to an account here would put one person's
name on another's work. Leave it out and the credential's own name stands in.

### 3.2 The instruction

```jsonc
{
  "reference": "2026-000431", // required
  "basedOnRevision": 3, // required — the version you read
  "status": "approved", // optional; absent = leave it where it is
  "statusReason": "Out of stock until March.", // ≤ 500; required by declined/cancelled
  "note": "Half now, half in March — agreed by phone.", // ≤ 500; quoted in the customer's mail
  "lines": [
    // optional; absent = leave the lines alone
    { "productSourceId": "K-88120", "pieces": 10, "priceMinor": 200 },
  ],
  "paid": true, // optional; absent = leave the record alone
  "notify": true, // required — is the customer written to?
  "showCustomer": true, // required — does their own page move on to this version?
}
```

**`basedOnRevision` is the whole of the concurrency story.** It is the
`revisionNumber` the read handed you. If the order has moved since, the
instruction is refused with `order-changed` and the version it now stands at,
rather than being applied to facts that changed underneath the decision.

**`notify` and `showCustomer` have no defaults, on purpose.** They are the two
questions a manager answers on every move (FR-NOTIF-03), and a default would
quietly decide for the shop how loud its own mail is. `notify: true` on an
instruction that changes nothing still sends nothing.

**`lines` is the order's contents whole, not a patch.** A version assembled
from "the old lines plus these two" is a version nobody can point at. Lines are
named by `productSourceId` and counted in **pieces**; `priceMinor` is the price
of one piece, and `null` takes today's price from the list the order is charged
against. The unit the customer read the line through and their own line note
are carried forward from the line being replaced — both are the customer's
reading of their own order.

**A write-back changes the lines and nothing else the order says.** The
address, the party, the payment method, the contact and the customer's note all
came _from_ here and are the customer's answer to the shop's checkout.

**The status vocabulary is the platform's coarse one** and your own steps are
mapped onto it on your side. What a move is allowed to be, whoever asks:

| From        | May go to                            |
| ----------- | ------------------------------------ |
| `requested` | `approved`, `declined`, `cancelled`  |
| `approved`  | `ready`, `requested`, `cancelled`    |
| `ready`     | `completed`, `approved`, `cancelled` |
| `completed` | `ready`, `requested`                 |
| `declined`  | `requested`                          |
| `cancelled` | `requested`                          |

`declined` and `cancelled` require `statusReason` — they are the two states
that owe the customer an answer, and the customer is shown it.

### 3.3 What comes back

```jsonc
{
  "run": {
    "id": "…", "area": "orders", "source": "api",
    "status": "applied",          // applied | no-change | failed
    "stagedReason": null,         // always null here
    "tokenName": "ERP order exchange", "actorEmail": null,
    "startedAt": "…", "finishedAt": "…",
    "summary": { … }, "error": null, "notice": null
  },
  "plan": {
    "summary": {
      "rows": 46, "create": 0, "update": 18, "softDelete": 0, "restore": 0,
      "unchanged": 27, "mailed": 11, "errors": 1, "fields": []
    },
    "orders": [
      {
        "reference": "2026-000431",
        "kind": "adjustment",       // adjustment | transition | payment | unchanged
        "status": "approved",
        "paymentState": "paid",
        "revisionNumber": 4,        // what your next instruction about it must answer
        "notified": true
      }
    ],
    "rowErrors": [ { "row": 12, "reference": "2026-000402",
                     "code": "order-changed", "params": { "current": "5" } } ],
    "truncated": false              // lists capped at 2000 items; counts stay exact
  }
}
```

The shared counters read, for this area: `update` = orders this run answered,
`unchanged` = orders that already said what it said, `mailed` = messages sent,
`errors` = instructions refused. `create`, `softDelete` and `restore` stay zero
— an order arrives from the storefront and never leaves.

`kind` is why the version exists:

| `kind`       | What happened                                          | Versions written |
| ------------ | ------------------------------------------------------ | ---------------- |
| `adjustment` | the order's content moved (with or without its status) | 1                |
| `transition` | only its status moved                                  | 1                |
| `payment`    | neither did, and the money was recorded                | **0**            |
| `unchanged`  | it already said what you told it (FR-ADM-16)           | 0                |

**`unchanged` is the one a polling source produces most.** It is reported, not
refused: re-sending is the normal behaviour of a system that cannot remember
what it sent. A batch in which every instruction is `unchanged` is filed as
`status: "no-change"`.

**The money on its own is not a version.** `paid: true` with nothing else
changed goes through the same writer a manager's tick uses, so the two leave
the same record.

### 3.4 Instruction errors

Refusals are per instruction, in `plan.rowErrors`, and never fail the batch.
`row` is the 1-based position in what you sent. `params` always carries
`reference`, plus the value a refusal is about where it has one: `current` (the
version the order actually stands at) or `productSourceId`.

| `code`                   | `params` beyond `reference` | Meaning                                                                |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------- |
| `order-not-found`        | —                           | no order is quoted that                                                |
| `duplicate-reference`    | —                           | the same order twice in one batch; nothing can say which is later      |
| `order-changed`          | `current`                   | the order moved since you read it — re-read it (§2.1) and decide again |
| `order-called-off`       | —                           | the customer cancelled it; stop, do not drive it forward               |
| `transition-not-allowed` | `status`                    | the order cannot go there from where it is                             |
| `reason-required`        | —                           | `declined`/`cancelled` was sent without `statusReason`                 |
| `unknown-product`        | `productSourceId`           | no product here carries that key                                       |
| `duplicate-product`      | `productSourceId`           | one instruction names a product twice                                  |
| `payment-not-recordable` | —                           | nothing is owed on an order that ended                                 |

A schema violation in the body is refused wholesale (400) before anything is
written — one malformed instruction is a bug in the sender, not a row somebody
typed badly.

**`order-changed` is checked before `order-called-off`.** A cancellation writes
a version, so an instruction prepared before it will usually meet the version
refusal first; re-read the order and you will see `cancelled`.

### 3.5 Reading a run back — `GET /api/machine/sync/orders/runs/{id}`

→ 200 `{ run }`, as it stands now. → 404 `run-not-found` for an id this
credential's area has never held.

Less useful here than in the other two areas, and that is by design: an order
run is terminal on arrival, so the submission's answer is already the final
word. It is worth keeping the id for your own trail, and the route is scoped to
the **area** your token may write rather than to the token that sent the run —
rotate your credential and you still read your own history.

### 3.6 Reporting your own breakage — `POST /api/machine/sync/orders/failures`

```json
{ "message": "order export ended early: connection reset", "label": "orders" }
```

→ 201 `{ run }` with `status: "failed"`. `message` is kept verbatim, ≤ 500
chars. Same scope, same ownership gate.

Call it whenever a scheduled cycle cannot happen. An exchange that has stopped
answering orders is otherwise indistinguishable from one with nothing to
answer — and in this area that silence costs the most, because customers are
waiting to hear where their orders stand and nobody here has been told to
answer them by hand.

---

## 4. The shop's own paperwork — the document routes

Scope: `order-sync`. Refused unless the area is owned.

What your back office prints — the payment invoice above all — is a real
document with the shop's layout on it, and it arrives here as **bytes**. The
platform draws only what it has the data for. A document **writes no version
and files no run**: nothing about the order changed.

### 4.1 Filing one — `POST /api/machine/orders/{reference}/documents/{kind}`

`multipart/form-data`, not JSON:

| Part     | Value                                                      |
| -------- | ---------------------------------------------------------- |
| `file`   | the document itself — PDF, PNG, JPEG, WebP or GIF, ≤ 20 MB |
| `notify` | `"true"` or `"false"` — required, as on a write-back       |

`{kind}` is `payment-instructions` or `order-summary`. A supplied
`order-summary` replaces the one the platform draws; removing it restores the
drawn one. `payment-instructions` only ever arrives this way.

Filing one replaces whatever was there of that kind. The bytes are sniffed
rather than trusted, so a mislabelled part is refused (415).

**The ordering rule: supply the file before the version that announces it.**
A document is filed against the version the order stands at, and the customer
is offered it only once their own view has reached that version. Post the
invoice, then send the write-back that accepts the order with `notify: true`,
and the one message carries both. `notify: true` on the upload itself is
refused with `customer-behind` when their page has not reached the version the
file belongs to — which is exactly what happens if you do it the other way
round.

Where your back office cannot print the invoice until after it has accepted the
order, use the upload's own `notify: true` to send it as a second message. The
acceptance mail is never held for a file that may never come.

| Code                    | Status | Meaning                                                  |
| ----------------------- | ------ | -------------------------------------------------------- |
| `customer-behind`       | 409    | asked to announce a file the customer's page cannot open |
| `document-not-supplied` | 409    | asked to announce a kind that was never filed            |
| —                       | 400    | no `file` part, or an unknown `{kind}`                   |
| —                       | 415    | the bytes are not one of the accepted types              |

### 4.2 Taking one back off — `DELETE /api/machine/orders/{reference}/documents/{kind}`

→ 200, with no body. The correction for a file posted against the wrong order or superseded
by a reprint. It exists on this side because while the area is owned there is
nobody else who could: the panel's own delete is refused under exactly this
setting.

---

## 5. When mail is sent

**To the customer**, per instruction: `notify: true` sends the message that
belongs to what the instruction did — the status message for a move, the
"changed" one for an adjustment. `showCustomer` decides separately whether
their page moves on. An instruction that writes nothing sends nothing whatever
the flags say. Any status message carries the payment instructions as an
attachment while the order owes money.

**To the shop**, about the exchange itself (FR-NOTIF-09), on a **change of
state** and not on a run:

| Message                                              | Sent when                                        |
| ---------------------------------------------------- | ------------------------------------------------ |
| [`orderSyncFailed`](mail.md#order-sync-failed)       | the first failure after the exchange was working |
| [`orderSyncRecovered`](mail.md#order-sync-recovered) | the first run that goes through after a failure  |

Two rather than the other areas' three or four: nothing here waits for a
person, so there is no "a run is waiting for you", and nothing it brings lands
on anybody's desk.

---

## 6. Adapter checklist

- [ ] `GET /api/machine/token` at boot; refuse to start if `order-sync` is
      missing and you intend to write.
- [ ] Poll `GET /api/machine/orders?since=<last updatedAt>`, page to the end,
      store each order's `revisionNumber` beside your own copy.
- [ ] Work the order in your own system. Map your steps onto the six states.
- [ ] Supply the invoice (§4.1) **before** the write-back that announces it.
- [ ] Write back **one instruction per order**, carrying everything that
      happened to it, quoting `basedOnRevision`, and answering
      `notify`/`showCustomer` deliberately.
- [ ] Treat `unchanged` as success. Treat `order-changed` as "re-read §2.1 and
      decide again". Treat `order-called-off` as "stop".
- [ ] Call `POST /api/machine/sync/orders/failures` when a cycle cannot run at
      all, so the shop is told rather than left guessing.
- [ ] Never parse `message`; match on `code`. Never parse a cursor.
