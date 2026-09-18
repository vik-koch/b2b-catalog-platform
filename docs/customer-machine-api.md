# The customer machine API

The wire-level reference for whoever writes the system on the other end of the
customer exchange — an ERP adapter, a converter, a scheduled puller.

It is the companion to [the catalog machine API](catalog-machine-api.md), and
the counterpart of [the customer exchange](customer-sync.md), which explains
what the platform does with a run and why. This file says what to send, what
comes back, and what each of those causes. Where the two overlap, the exchange
document has the reasoning and this one has the shape.

Requirements: FR-ADM-11, FR-ADM-13, FR-ADM-14, FR-ADM-15, FR-ADM-17,
FR-ADM-18, FR-ADM-10, FR-NOTIF-09, NFR-SEC-09, NFR-LEGAL-07, NFR-LEGAL-08.

---

## 1. Credentials and prerequisites

**Token.** An admin issues a machine token in the panel (`/admin/api-tokens`).
The value is `<8-char prefix>.<43-char base64url secret>` and is shown **once**;
there is no endpoint that reads it back. It never expires — revocation is the
only off switch, and it takes effect on the next request (the row is read on
every call).

**Header.** `Authorization: Bearer <value>`. Never a cookie, never a query
parameter. A session cookie is not accepted on any `/machine/*` route, and a
machine token is not accepted anywhere else.

**Scopes.** Five exist; a token carries one or more, chosen at issue time and
**not editable afterwards** (rotate by issuing a new token and revoking the old).

| Scope           | Grants                                     |
| --------------- | ------------------------------------------ |
| `catalog-sync`  | the product exchange (out of scope here)   |
| `customer-sync` | writing customer accounts                  |
| `customer-read` | reading the customer book                  |
| `order-read`    | reading the order book (out of scope here) |
| `order-sync`    | answering orders (out of scope here)       |

Reading and writing are deliberately separate powers. An adapter being brought
up can hold `customer-read` for weeks before anybody grants it `customer-sync`.

**Ownership switch.** Every _write_ in this area is refused unless an admin has
handed the customer area over to an external system (FR-ADM-10). Until then
`POST /machine/sync/customers/runs` answers **409 `customers-not-externally-owned`**.
The **read is not gated** by it — that is the point of the read: the ERP has to
see what is here before anyone decides to hand it over.

While the area _is_ owned, the mirror holds: the admin panel's customer editing
and the CSV upload are refused with `customers-externally-owned`. The pen is
held by exactly one side at a time.

**Base URL.** All paths below are under the API's global prefix: `/api`.
So the submit route is really `POST https://<host>/api/machine/sync/customers/runs`.

**There is no machine route that reads a run back.** The submit response is
the whole of what a client learns about its own run; the run log belongs to
staff (`/api/admin/sync/runs`, session-authenticated). Keep the `run.id` for
your own trail, but do not plan to poll it.

**Rate limit.** 60 requests per minute per client IP across the machine routes.
A puller paging the customer book at 200 rows a page should stay well inside it;
a backfill of 50k accounts is 250 pages, so pace it.

**Errors.** Refusals come back as JSON with a stable top-level `code`, and the
HTTP status carries the same meaning. Match on `code`, never on `message` —
the message is not a contract and is not localized for you.

```json
{ "code": "customers-not-externally-owned", "status": 409, "message": "…" }
```

| Code                             | Status | Meaning                                   |
| -------------------------------- | ------ | ----------------------------------------- |
| `not-authenticated`              | 401    | missing, unknown or revoked token         |
| `insufficient-scope`             | 403    | valid token, wrong capability             |
| `customers-not-externally-owned` | 409    | nobody handed the area over (writes only) |
| `invalid-cursor`                 | 400    | a cursor this endpoint did not issue      |

A schema violation in the body is refused wholesale (400) before anything is
diffed — see §3.4 on why that differs from a per-row error.

**Check the credential at boot:** `GET /api/machine/token` → `{ name, scopes }`.
Cheap, side-effect free, and the right thing to call on startup instead of
discovering a scope problem during a nightly run.

---

## 2. Reading accounts out — `GET /api/machine/customers/accounts`

Scope: `customer-read`. Not gated on ownership.

### Query

| Param    | Meaning                                                              |
| -------- | -------------------------------------------------------------------- |
| `since`  | ISO 8601; accounts whose `updatedAt` is **at or after** this instant |
| `cursor` | `nextCursor` from the previous page, verbatim                        |
| `limit`  | 1–200, default 200                                                   |

### Response

```json
{
  "accounts": [
    {
      "id": "8f2c…", // platform uuid, stable forever
      "sourceId": "K-1042", // your key, or null if never claimed
      "state": "active", // pending | invited | active | disabled | withdrawn
      "email": "…",
      "firstName": "…",
      "lastName": "…",
      "phone": "…",
      "customerType": "company", // company | person | null
      "companyName": "…",
      "companyRegistrationId": "…",
      "tierKey": "wholesale", // null = the base price list
      "createdAt": "2026-…",
      "updatedAt": "2026-…"
    }
  ],
  "nextCursor": "eyJ…" // null at the end of the list
}
```

Ordering is `updatedAt ASC, id ASC`. Staff accounts never appear — an admin or
manager is not a customer under any setting.

### Paging, and how to resume across runs

- Inside one sweep: follow `nextCursor` until it is null. The cursor is opaque
  base64; do not parse it, and do not carry it across runs — it is only valid
  against the ordering it was issued under.
- Between runs: remember the **last record's own `updatedAt`** and send it back
  as `since`. `since` is inclusive, so you will re-read the boundary rows; make
  your ingest idempotent rather than trying to shave a microsecond off.
- `invalid-cursor` is a hard error on purpose. It does not silently restart from
  the top — a puller that did would re-read the whole book and never say why.

### The two rows that matter to an adapter

**`sourceId: null`** — somebody registered on the storefront and nothing outside
can address them yet. This is the row the read exists for: create your own
counterparty, then give the account its key (by a claim run, §3.3, or by an
admin typing it in). Until it has a key, no write can reach it.

**`state: "withdrawn"`** — the person closed their own account (FR-AUTH-06).
It still appears in the listing, carrying only `id`, `sourceId`, `state`,
`createdAt`, `updatedAt`; every personal field is null. It is listed rather than
dropped so you learn the withdrawal happened — a customer that merely stopped
appearing reads as a filtered export. Any write naming that key is refused from
then on (`account-withdrawn`), permanently. Handle the erasure on your side
under your own obligations; the platform makes no claim about your copy.

---

## 3. Writing accounts — `POST /api/machine/sync/customers/runs`

Scope: `customer-sync`. Refused unless the area is owned. → **201** with
`{ run, plan }`.

### 3.0 The two rules the rest follows from

1. **No credential is ever issued from outside.** There is no password field
   and never will be. An account a run asks for is created `invited` with an
   unusable hash; the person receives _the platform's_ set-a-password link.
2. **Nothing is ever deleted, and nothing is swept.** The strongest a row can
   say is `access: "disabled"`. There is no "everything I didn't mention is
   gone" mode, unlike the catalog: a customer absent from your export is a
   customer you did not mention.

### 3.1 Request body

```jsonc
{
  "rows": [/* ≤ 50 000 rows, see below */],
  "options": {
    "fields": ["email", "tier", "company"], // what this run may rewrite
    "createMissing": true, // unknown key + enabled ⇒ create
    "updateExisting": true,
    "claimByEmail": false, // see §3.3
  },
  "label": "nightly customers 2026-09-17", // what the log calls this run
  "requestReview": false, // "stage this even if it'd apply"
  "notice": "source export was 6h stale", // shown to staff beside the run
}
```

`options` is optional and every key defaults as shown. `fields` limits what a
run may rewrite on accounts that already exist: an empty array writes nothing
but access. Set `requestReview: true` whenever your side could not fully vouch
for what it parsed — it reads differently to staff than "this run was large".

The body limit on this route is 10 MB; the row cap is 50 000. A customer book
large enough to reach either is one to bring in by CSV upload instead.

### 3.2 The row

Keyed by `sourceId` — your own key, never the email address, never the
registration id. Both of those change, and two people can share one.

| Field                   | Type                       | Notes                                                      |
| ----------------------- | -------------------------- | ---------------------------------------------------------- |
| `sourceId`              | string, req.               | 1–255 chars; the only identity the platform models         |
| `email`                 | string                     | lowercased; required to create; writable after             |
| `accountId`             | uuid                       | claim target — see §3.3; read only when the key is unknown |
| `access`                | `enabled`/`disabled`       | see §3.2.1                                                 |
| `tierKey`               | string \| null             | price list key; **null = the base list**                   |
| `customerType`          | `company`/`person` \| null | null = neither is known                                    |
| `companyName`           | string \| null             | company ⇒ name **and** id, or the row is refused           |
| `companyRegistrationId` | string \| null             | ditto                                                      |
| `firstName`             | string                     | **create only**, ignored on an existing account            |
| `lastName`              | string                     | create only                                                |
| `phone`                 | string                     | create only                                                |
| `sendPasswordLink`      | boolean (false)            | an instruction, not a state — see the warning              |

**Absent ≠ empty.** A field you omit is left alone. Only `tierKey`,
`customerType`, `companyName` and `companyRegistrationId` are _nullable_, and
for those an explicit `null` is a real value (the base price list; a customer
who is not a company). The body is `strict` — an unknown field fails the request.

**Name and phone are write-once.** They are the account holder's to maintain
and travel outward only. A feed that resent them every twenty minutes would
undo a customer's own correction before they finished reading the confirmation.

> **`sendPasswordLink` is the one non-idempotent field in the whole API.** Every
> run carrying `true` sends another mail. Set it from a discrete event on your
> side (somebody pressed a button, somebody rang the shop) and never as a
> standing column in an export, or you will mail the entire customer list on
> every cycle. The platform cannot tell that apart from a person clicking twice.

#### 3.2.1 What `access` means

Two values, not five, because what you know is whether this person is one of
yours. What that comes to depends on where the account stands:

| `access`   | account state               | effect                                                                         |
| ---------- | --------------------------- | ------------------------------------------------------------------------------ |
| `enabled`  | does not exist              | create it `invited` + **mail the set-a-password link**                         |
| `enabled`  | `pending` (registered here) | approve it → `invited` + **mail the link**                                     |
| `enabled`  | `disabled`                  | reactivate → `active` if they have a password, else `invited` (+ **mail**)     |
| `enabled`  | `invited` / `active`        | nothing                                                                        |
| `disabled` | anything but `disabled`     | switch off: **all sessions end**, outstanding set-a-password links are expired |
| `disabled` | `disabled`                  | nothing                                                                        |
| omitted    | —                           | access untouched                                                               |

A declined registration is simply a disabled account; there is no fifth state.

### 3.3 Claiming (`claimByEmail`, `claimById`)

An account that registered on the storefront has no `sourceId`. A run with
`claimByEmail: true` may adopt it by matching the address — **once**, only onto
an account whose key is null, and never onto staff or a withdrawn account. From
then on identity is the key exactly as everywhere else.

It surfaces in the plan as its own kind (`claim`), is counted separately
(`summary.claimed`), and the deployment's `maxClaims` — **0 by default** —
decides whether a run carrying one may apply unattended. Expect claims to wait
for a person unless the operator has deliberately raised that ceiling. The
danger being guarded is a typo'd address upstream taking over a real customer's
account and then tiering or disabling them inside a run nobody read.

With `claimByEmail` off, a row that _would_ have claimed is refused with
`account-unclaimed` rather than `email-taken` — it points at the option that
was off, not at a collision nobody can resolve.

**Claiming by identifier.** A row may instead name the account outright with
`accountId` — the platform's own id, exactly as `GET /machine/customers/accounts`
reports it (§2). That is the preferred form once you have read the accounts out:
you are naming the row you looked at rather than hoping an address match finds
the same one, and it works for an account whose address you do not know or do
not agree about.

It is its own option (`claimById`), its own diff kind (`claim-id`), its own
count (`summary.claimedById`) and its own ceiling (`maxIdClaims`, **0 by
default**). Sharing the address ceiling would have been wrong in both
directions: the evidence here is stronger — this shop issued the identifier and
you can only have read it from here — but the failure it cannot prevent is the
one that actually happens, a wrong mapping on your side, and that ends the same
way whichever field carried it. Two numbers let an operator let identifier
claims through while making every address match wait for a person.

`accountId` is read **only when the `sourceId` is unknown**. Once an account
carries a key, that key is what the row is about and a disagreeing identifier
changes nothing.

Its refusals are its own, because the remedy differs:

- `account-unknown` — no account here has that id. Nothing else in the row is
  used to guess what you meant.
- `account-already-keyed` — that account already answers to a source key.
- `account-unclaimed-by-id` — it could be adopted, but `claimById` was off.

There is no CSV column for it. The operator's file upload (FR-ADM-12) never
offers this: a person with a spreadsheet does not have the shop's internal ids,
and the client that does is the one that read them.

### 3.4 Row errors

One bad row never fails the run. It is skipped, listed in `plan.rowErrors`, and
counted in `summary.errors`; everything else still applies.

| Code                         | `params`             | Meaning                                                            |
| ---------------------------- | -------------------- | ------------------------------------------------------------------ |
| `missing-source-id`          | —                    | no key                                                             |
| `duplicate-source-id`        | —                    | the same key twice in one run                                      |
| `duplicate-email`            | `email`              | two rows of this run claim one address                             |
| `email-taken`                | `email`              | another keyed account already has it                               |
| `account-unclaimed`          | `email`              | an unkeyed account has it — turn on `claimByEmail`                 |
| `account-unknown`            | `accountId`          | `accountId` names no account here                                  |
| `account-already-keyed`      | `accountId`          | that account already carries a source key                          |
| `account-unclaimed-by-id`    | `accountId`, `email` | claimable by id, but `claimById` was off                           |
| `unknown-tier`               | `key`, `known`       | no price list is keyed that (`known` lists the real ones)          |
| `cannot-create-account`      | —                    | unknown key asking for access, no address (or `createMissing` off) |
| `account-withdrawn`          | —                    | the person closed it; permanent                                    |
| `staff-account`              | (`email`)            | the key or address names an admin/manager                          |
| `cannot-send-link`           | —                    | a link asked for an account that cannot sign in                    |
| `company-details-incomplete` | —                    | a company with only one of name/registration id                    |
| `invalid-value`              | `column`, `value`    | **CSV upload only** — a headless body is schema-refused            |

Note the asymmetry deliberately: a malformed _field_ in a headless submission
refuses the **whole request** (400), because a converter should be fixed, not
tolerated. Only an operator's uploaded file gets per-cell forgiveness.

### 3.5 What comes back

```jsonc
{
  "run": {
    "id": "…", "area": "customers", "source": "api",
    "status": "applied",          // see below
    "stagedReason": null,         // "policy" | "requested" when waiting
    "tokenName": "erp nightly", "actorEmail": null,
    "startedAt": "…", "finishedAt": "…",
    "summary": { … }, "error": null, "notice": null
  },
  "plan": {
    "summary": {
      "rows": 120, "create": 2, "update": 7, "softDelete": 0, "restore": 1,
      "claimed": 0, "claimedById": 0, "mailed": 3, "unchanged": 110, "errors": 0,
      "fields": ["email", "tier"]
    },
    "accounts": [ { "kind": "invite", "sourceId": "K-1042", "email": "…",
                    "id": null, "changes": [], "mailed": true } ],
    "rowErrors": [],
    "truncated": false            // lists capped at 2000 items; counts stay exact
  }
}
```

The shared counters read, for this area: `create` = accounts invited,
`update` = accounts edited, `softDelete` = accounts switched off,
`restore` = switched back on, `claimed` = adopted by address,
`claimedById` = adopted by identifier, `mailed` = mails sent.
Change kinds are `invite | update | disable | enable | claim | claim-id`; a
claim outranks
whatever else the row did.

### 3.6 Run status — did it actually happen?

| `status`     | Did it write? | What the adapter should do                      |
| ------------ | ------------- | ----------------------------------------------- |
| `applied`    | yes           | nothing                                         |
| `no-change`  | nothing to do | nothing (terminal on arrival)                   |
| `previewed`  | **no**        | it is waiting for a person; read `stagedReason` |
| `failed`     | no            | your own report, or the write broke             |
| `superseded` | no            | a later run replaced it while it waited         |
| `discarded`  | no            | a person said no to it                          |

**`previewed` is the one to handle.** The run is staged and nothing was written;
a manager or admin must apply it in the panel. There is **no machine commit
route** — an automated client never presses apply. Do not retry: a new
submission supersedes the staged one, which means retrying in a loop guarantees
nobody ever answers it. Log it and move on; the next cycle will re-propose the
same diff anyway.

A run stages itself when (in this precedence):

1. `requestReview: true` → `stagedReason: "requested"`
2. `summary.create > maxInvites` (default **25**)
3. `summary.softDelete > maxDisables` (default **0** — _any_ disable waits)
4. `summary.claimed > maxClaims` (default **0**)
5. `summary.claimedById > maxIdClaims` (default **0**)

→ `stagedReason: "policy"`. There is no percentage ceiling for customers and no
category ceiling; the absolute numbers are the whole policy. Mails sent on
request (`sendPasswordLink`) are not counted — a link to somebody's own address
should not sit in a queue.

**Practical consequence:** on default settings, a first import of more than 25
customers waits, and _every_ deactivation waits. Plan the go-live around an
operator raising those numbers deliberately, or around uploading the initial
book by CSV in the panel instead.

### 3.7 Reading a run back — `GET /api/machine/sync/customers/runs/{id}`

```
GET /api/machine/sync/customers/runs/{id}
Authorization: Bearer <token>
```

→ 200 `{ run }`, the same run object the submission answered with, as it
stands **now**. → 404 `run-not-found` for an id this credential's area has
never held.

Keep the run id you were given and ask again on your next cycle whenever the
submission came back `previewed`. The submission's answer is only the first
word: a staged run is decided by a person afterwards, and — because your next
submission **supersedes** the one still waiting — a scheduled feed that simply
retries will replace the run somebody was about to read and never learn that
this is what it has been doing. What you are looking for:

| `status`     | What it means for the next cycle                             |
| ------------ | ------------------------------------------------------------ |
| `previewed`  | still waiting for a person. Do not resend; wait.             |
| `applied`    | someone applied it. Carry on normally.                       |
| `discarded`  | someone said no to it. Do not resend the same thing blindly. |
| `superseded` | **you** replaced it by submitting again while it waited.     |

The read is scoped to the **area** your token may write, not to the token that
sent the run: rotate your credential and you still read your own history. It is
not gated on ownership either — if your writes have started being refused
because an operator took the area back by hand, this route is how you find out
that nothing is broken.

There is no `actorEmail` on this response. You are told what became of the run,
not who decided it.

### 3.8 Reporting your own breakage — `POST /api/machine/sync/customers/failures`

```json
{ "message": "source export unreadable: …", "label": "nightly customers" }
```

→ 201 `{ run }` with `status: "failed"`. `message` is kept verbatim, ≤ 500
chars — a sentence a person can act on, not a stack trace. Same scope, same
ownership gate.

Call it whenever a scheduled run cannot happen. An exchange that has stopped
working is otherwise indistinguishable from one with nothing to send, and this
is what drives the "feed has stopped" mail.

---

## 4. When mail is sent

Two audiences, and they never overlap.

### 4.1 To the customer — set-a-password links

Sent **after** the write commits, never before (a link that has gone out cannot
be rolled back). A failure to send is logged and never fails the run.

| Trigger                                                                                                                                          | Mail |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| The run creates the account (`invite`)                                                                                                           | yes  |
| The run leaves an account able to sign in, `invited`, with no password chosen — approving a registration, reactivating someone who never set one | yes  |
| `sendPasswordLink: true` on an account that can sign in after this run                                                                           | yes  |
| Anything else — an ordinary edit, a tier change, a no-op row                                                                                     | no   |

The first two are consequences of a _move_, so they do not repeat: the next run,
which moves nothing, mails nothing. The third is an instruction and repeats
every time you send it. `plan.accounts[].mailed` tells you per account, and
`summary.mailed` counts them.

A link asked for on an account that cannot sign in (`pending`, `disabled` after
this run) is the row error `cannot-send-link`; a row that reactivates somebody
_and_ asks for their link in one go works, because the check is made against
where the run leaves them.

### 4.2 To the shop — feed notifications

Go to the deployment's configured admin addresses, not to staff accounts. They
are **state changes of your feed**, not per-run announcements — a feed that
breaks at midnight writes one mail, not seventy-two.

State is read off the previous _machine_ run **of this area** (`applied`,
`no-change`, `discarded` = ok; `previewed`, `superseded` = waiting; `failed` =
failed). The catalog feed and the customer feed are independent; neither
announces the other's recovery.

| Transition             | Mail                                                    |
| ---------------------- | ------------------------------------------------------- |
| ok/waiting → failed    | "the exchange has stopped"                              |
| failed → anything else | "working again" (plus a waiting mail if it also staged) |
| ok → waiting           | "a run is waiting for a decision"                       |
| repeat of same state   | nothing                                                 |

The catalog's fourth mail — "new products nobody has published" — has no
customer counterpart: a customer run that invited people has already mailed
those people, and there is no queue left on anybody's desk.

Nothing here is retried and nothing fails a run. The panel's run log is the
channel that does not depend on SMTP.

---

## 5. Adapter checklist

- [ ] `GET /api/machine/token` at boot; assert the scopes you need.
- [ ] Pull with `since` = last seen `updatedAt`, follow `nextCursor` within a
      sweep, treat ingest as idempotent (boundary rows repeat).
- [ ] Give every storefront registration (`sourceId: null`) a counterparty, then
      a key — by an admin, or by one deliberate claim run. Prefer `accountId` +
      `claimById` over the address match: you read that id out of here.
- [ ] Record `state: "withdrawn"` and stop writing that key forever.
- [ ] Send only fields that changed; never resend name/phone; never put
      `sendPasswordLink` in a standing export.
- [ ] Treat `status: "previewed"` as "a person must act", log it, do not retry.
- [ ] Keep the run id and poll `GET /machine/sync/customers/runs/{id}` until a
      staged run is resolved — a retry supersedes it rather than answering it.
- [ ] Report every failed cycle to `/failures` so the shop is told.
- [ ] Match on `code`, never on `message`.
