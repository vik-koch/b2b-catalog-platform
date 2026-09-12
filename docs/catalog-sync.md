# The automated catalog feed

This document is the companion to [the life of an order](order-lifecycle.md)
and [the life of an account](account-lifecycle.md), and exists for the same
reason: what happens when an external system writes the catalog is spread
across a run log, a policy, a work counter and four mail templates, none of
which says on its own what the shop actually experiences.

What follows is the logic **as it currently stands**, not the thinking behind
it. The reasoning lives in the ADRs; the requirements live in
`requirements.md`.

Requirements: FR-ADM-02 (the import itself), FR-ADM-07 (an automated source
submitting one), FR-ADM-09 (the log), FR-ADM-10 (an external system owning the
catalog), FR-WORK-02 (what waits for a person). Decisions:
[ADR 0053](adr/0053-machine-tokens-for-automated-clients.md),
[ADR 0054](adr/0054-source-system-exchange-as-an-inbound-adapter.md),
[ADR 0055](adr/0055-when-an-automated-run-applies-itself.md),
[ADR 0056](adr/0056-an-external-owner-makes-fields-read-only.md),
[ADR 0057](adr/0057-exchange-notifications-are-state-changes.md).

## What a run can become

A submission is diffed against the catalog, and what happens next is decided by
the diff rather than by the caller:

| Status       | What it means                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `applied`    | Its effect was within the policy the deployment declares, so it wrote itself.                          |
| `waiting`    | It was held back for a person — its effect was outside that policy, or the source asked to be doubted. |
| `no change`  | The source and the catalog already agreed. Terminal on arrival: nothing to apply, nothing to decide.   |
| `failed`     | The source reported that it broke, or the submission could not be read.                                |
| `superseded` | It was waiting and a newer run took its place.                                                         |
| `discarded`  | It was waiting and an admin said no.                                                                   |

Only a `waiting` run is work: it is counted on the admin panel's sync row and
clears when somebody applies or discards it. Nothing is acknowledged — the
count is a `COUNT` over the same filter its link opens.

## What the shop is told, and when

Four messages, and three of them are sent on a **change of state** rather than
on a run. A feed on a twenty-minute cadence that stops working at midnight
would otherwise write the same mail seventy times before anybody opened one.

| Message                                   | Sent when                                                              | To                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [`syncFailed`](mail.md#sync-failed)       | The first failure after the feed was working.                          | The admin, and the operator where a deployment names one. |
| [`syncRecovered`](mail.md#sync-recovered) | The first run that goes through after a failure.                       | The same readers.                                         |
| [`syncWaiting`](mail.md#sync-waiting)     | Something starts waiting for a person and nothing already was.         | The admin.                                                |
| [`syncCreated`](mail.md#sync-created)     | A run applies **itself** and brings products nobody has published yet. | The admin.                                                |

The panel is the channel that depends on none of this: the staged count and the
last-sync line are read off the runs themselves, so a message that never
arrives costs the news and never the record. Which is also why a failed send is
logged and dropped rather than retried — a catalog that imported and a message
about it are not the same event.

A run an admin applies by hand says nothing at all. They have just read the
preview that says what it does.

## What the feed cannot do

**Rename a product's key.** A run says what the catalog should contain, keyed by
the source system's own identifier, and carries no way to say "this row is the
product you knew as X". So a key that changes over there arrives as a new
product plus the disappearance of an old one — and the old one's slug, its
description, its photos, its attributes, what it is paired with and its
documents stay behind on a row the run soft-deletes.

It is a manual correction, and it needs no deploy:

1. Take the catalog back under **Data ownership** in the admin panel. The feed
   is refused from its next attempt, so nothing lands mid-correction.
2. Correct the product's catalogue ID in the product editor.
3. Hand the catalog over again.

That is the whole of it, and it is deliberately not automated: the keys this
feeds on are ones a source system does not normally re-issue, and a rename is a
thing somebody should see rather than something a feed does quietly at 3am.

**Guarantee that those keys are consistent.** They belong to the other system.
If it retires a key and later gives it to a different product, that product
becomes this one here, and nothing in a diff can tell that from a legitimate
edit — the run log and the preview are what make it visible afterwards.

## What a run that dies leaves behind

The question an operator actually has is "the feed broke — what state is the
catalog in?", and the answer is always **the one it was in before the run**.

A run is applied in a **single transaction**: claiming the run, writing every
product and category it touches, and marking it applied all commit together or
none of them do. There is no point at which half a catalog is live. A crash
between the write and the bookkeeping cannot happen either, because they are
the same commit — so a run is never left claiming to have applied something it
did not, and never leaves a catalog the log has no record of.

What that leaves is three ways a feed can stop, and all three are visible:

| What happened                                          | What the catalog shows | What the log shows                                         |
| ------------------------------------------------------ | ---------------------- | ---------------------------------------------------------- |
| The run was rejected (bad rows, an unknown price list) | Its previous state     | Nothing was ever a run — the caller is told, in its answer |
| The run was applied and the write failed               | Its previous state     | A `failed` run carrying the message                        |
| The feed broke before it could submit anything         | Its previous state     | A `failed` run the adapter reported for itself             |

The third row is the one that has to be deliberate. A source system that cannot
read its own export, or cannot reach the platform at all, produces no
submission — and a feed that has stopped working looks exactly like a feed with
nothing to send. So the adapter reports the breakage as a run of its own,
carrying no options and no summary because nothing was ever intended or
counted, and the notification above treats it as the state change it is.

Retrying is safe by construction and needs no cleanup step. A run is a
statement of what the catalog should say, not a list of edits to append: the
same file submitted twice makes the second run a no-change. Correcting a feed
is therefore sending the corrected file, never undoing the last one.

## The journeys

These are walked against a running API by `sync-journeys.spec.ts` and printed
from the same literals. A cell that says nothing is not a gap: every step
asserts the whole observable state, so an unmentioned reading is asserted
_unchanged_ and an unmentioned message is asserted not to have been sent —
which is most of what these journeys are for.

<!-- generated:sync-journeys -->
<details>
<summary><b>A feed that breaks, stays broken, and comes back</b> — The case a notification gets wrong by repeating itself: a feed on a twenty-minute cadence that stops working at midnight would write the same mail until somebody read one. It is announced once and answered once.</summary>

**The feed.** A feed nobody has heard from yet.

**Starting from.** It has not run yet.

**Which leaves it.** The run: `none`<br>Waiting for the admin: 0

| #   | What happens                          | Who    | What changes                                                                        |
| --- | ------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| 1   | The source sends an ordinary export.  | system | The run: `applied`<br>Mail to the shop: [`syncCreated`](mail.md#sync-created)       |
| 2   | The next run breaks.                  | system | The run: `failed`<br>Mail to the shop: [`syncFailed`](mail.md#sync-failed)          |
| 3   | It breaks again twenty minutes later. | system | —                                                                                   |
| 4   | And again.                            | system | —                                                                                   |
| 5   | The source is fixed and delivers.     | system | The run: `no change`<br>Mail to the shop: [`syncRecovered`](mail.md#sync-recovered) |

</details>

<details>
<summary><b>A run that waits, is overtaken, and is answered</b> — One thing waiting is one thing waiting however many runs produce it. The count on the admin panel is the durable half of this — it does not depend on a message arriving — and it falls on its own when the run is answered.</summary>

**The feed.** A feed that has delivered normally.

**Starting from.** An ordinary export lands.

**Which leaves it.** The run: `applied`<br>Waiting for the admin: 0

| #   | What happens                                          | Who    | What changes                                                                                              |
| --- | ----------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| 1   | The source sends an export it cannot fully vouch for. | system | The run: `waiting`<br>Waiting for the admin: 1<br>Mail to the shop: [`syncWaiting`](mail.md#sync-waiting) |
| 2   | It sends another one twenty minutes later.            | system | Waiting for the admin: 1                                                                                  |
| 3   | The admin discards it.                                | admin  | The run: `discarded`<br>Waiting for the admin: 0                                                          |
| 4   | The source sends a doubtful export again.             | system | The run: `waiting`<br>Waiting for the admin: 1<br>Mail to the shop: [`syncWaiting`](mail.md#sync-waiting) |
| 5   | The admin applies it.                                 | admin  | The run: `applied`<br>Waiting for the admin: 0                                                            |

</details>

<details>
<summary><b>New products arrive overnight</b> — The one message that is not a transition. A product the source creates is off the storefront until somebody writes its page, and nothing else tells the admin that work arrived while they were asleep.</summary>

**The feed.** A feed that has delivered normally.

**Starting from.** An ordinary export lands.

**Which leaves it.** The run: `applied`<br>Waiting for the admin: 0

| #   | What happens                                                 | Who    | What changes                                                                  |
| --- | ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------- |
| 1   | The nightly export carries products the shop has never seen. | system | The run: `applied`<br>Mail to the shop: [`syncCreated`](mail.md#sync-created) |
| 2   | The next run reprices them.                                  | system | The run: `applied`                                                            |
| 3   | The one after that carries the same prices again.            | system | The run: `no change`                                                          |

</details>
<!-- /generated:sync-journeys -->

### What the columns mean

<!-- generated:journey-legend -->

- **The run** — What became of the submission: `applied`, `waiting` for a person, `failed`, `no change` where the source and the catalog already agreed, or `discarded`/`superseded` for a staged run that was answered or overtaken.
- **Waiting for the admin** — How many runs the admin panel counts as awaiting review — the figure on its sync row, asked of the same endpoint the panel asks. Counted from where this journey started, so it is this feed’s contribution and not the deployment’s history.
- **Mail to the shop** — What arrived for the people who run the shop at this step, named by the message it is. An empty cell means nothing was sent, and is asserted — which is most of what these journeys are about, because three of these four messages are sent on a change of state rather than on a run.

<!-- /generated:journey-legend -->
