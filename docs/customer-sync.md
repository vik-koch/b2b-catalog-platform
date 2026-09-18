# The customer exchange

This document is the companion to [the automated catalog feed](catalog-sync.md)
and [the order exchange](order-sync.md), and exists for the same reason: what happens when an external system writes the
shop's customer accounts is spread across a run log, a policy, a work counter,
a set of mail templates and the sign-in page, none of which says on its own
what an account holder actually experiences.

What follows is the logic **as it currently stands**, not the thinking behind
it. The reasoning lives in the ADRs; the requirements live in
`requirements.md`. What to actually send over the wire — routes, row fields,
error codes, what each one causes — is [the customer machine
API](customer-machine-api.md); how the three areas differ from one another is
[the comparison](exchange-areas.md).

Requirements: FR-ADM-11 (the exchange itself), FR-ADM-12 (a file an operator
uploads instead), FR-ADM-13 (no credential is ever issued from outside),
FR-ADM-14 (what identifies an account), FR-ADM-15 (the exchange never deletes),
FR-ADM-17 (claiming an account somebody registered here), FR-ADM-18 (reading
accounts back out), FR-ADM-09 (the log), FR-ADM-10 (an external system owning
the area), FR-AUTH-04 (what is closed while it does), FR-NOTIF-09 (what the
shop is told), FR-WORK-02 (what waits for a person), NFR-LEGAL-07 and
NFR-LEGAL-08 (what the privacy page has to say about both). Decisions:
[ADR 0053](adr/0053-machine-tokens-for-automated-clients.md),
[ADR 0055](adr/0055-when-an-automated-run-applies-itself.md),
[ADR 0056](adr/0056-an-external-owner-makes-fields-read-only.md),
[ADR 0057](adr/0057-exchange-notifications-are-state-changes.md),
[ADR 0060](adr/0060-the-exchange-is-area-scoped.md).

## The one rule the rest follows from

**The exchange can ask an account into being. It can never hand anybody the
means to sign in.**

A row creates an account with an unusable password hash and a status of
`invited`; what reaches the person is a link **this platform** generates, to a
page **on this platform**, where they choose a password nobody else has seen. A
source system cannot supply one, cannot set one, and cannot read one back. So
the worst an unattended exchange can do — the thing a credential in a nightly
export would otherwise make possible — is create an account nobody can use.

The mirror of that rule is deletion: the exchange has no way to remove an
account. The strongest row it can send switches one off, which keeps every
order, every address and every record of who somebody was
([FR-ADM-15](requirements.md#fr-adm-15)). A person who deletes their own account
here is reported outward as **withdrawn** and the source system keeps its own
record under its own obligations — which is what the privacy page has to say
plainly rather than promising an erasure the shop would have to perform by hand
([NFR-LEGAL-08](requirements.md#nfr-legal-08)).

## What a run can become

A submission is diffed against the accounts, and what happens next is decided
by the diff rather than by the caller — the same five outcomes a catalog run
has, for the same reasons:

| Status       | What it means                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `applied`    | Its effect was within the policy the deployment declares, so it wrote itself.                          |
| `waiting`    | It was held back for a person — its effect was outside that policy, or the source asked to be doubted. |
| `no change`  | The source and the accounts already agreed. Terminal on arrival.                                       |
| `failed`     | The source reported that it broke, or the submission could not be read.                                |
| `superseded` | It was waiting and a newer run took its place.                                                         |
| `discarded`  | It was waiting and somebody said no.                                                                   |

Two things differ from the catalog, and both follow from what is being written.

**A staged customer run is a manager's work as well as an admin's**
([FR-ADM-09](requirements.md#fr-adm-09)). Customer accounts are a manager's to
handle by hand, so they are theirs to review when something else proposes a
change — and the work-awaiting count is its own figure rather than part of the
catalog's, because one combined number would show a manager work they cannot
finish.

**A claim is never applied unattended.** Adopting an account by email address
changes _which account a key means_ from then on
([FR-ADM-17](requirements.md#fr-adm-17)), so a run that claims is staged whatever
the policy would otherwise allow.

## What the shop is told, and when

Three messages, all sent on a **change of state** rather than on a run, and all
worded about accounts rather than about the catalog
([FR-NOTIF-09](requirements.md#fr-notif-09)):

| Message                                                    | Sent when                                                      | To                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| [`customerSyncFailed`](mail.md#customer-sync-failed)       | The first failure after the exchange was working.              | The admin, and the operator where a deployment names one. |
| [`customerSyncRecovered`](mail.md#customer-sync-recovered) | The first run that goes through after a failure.               | The same readers.                                         |
| [`customerSyncWaiting`](mail.md#customer-sync-waiting)     | Something starts waiting for a person and nothing already was. | The admin.                                                |

Each area's state is read against **its own** last run, so a broken catalog
feed and a working customer exchange are two independent facts: neither
announces the other's recovery, and neither suppresses the other's failure.

There is deliberately **no customer counterpart** to the catalog's "new products
arrived". That message exists because an imported product leaves work on
somebody's desk — a page to write before it can be sold. An imported account
leaves none: what it needs is a password, and the run has already sent its owner
a link to set one.

The panel is the channel that depends on none of this. The staged count and the
run log are read off the runs themselves, so a message that never arrives costs
the news and never the record.

## What the exchange cannot do

**Issue, set, or read a password.** Stated above, and the reason the rest of
this document is short.

**Delete an account.** The strongest row switches one off.

**Match an account that has no source key.** Identity is the source system's own
key ([FR-ADM-14](requirements.md#fr-adm-14)), so an account somebody registered on
the website is invisible to every row — which is the deadlock
[FR-ADM-17](requirements.md#fr-adm-17) exists to break, once, with a person
agreeing to it. After that the key is the identity, and the next run claims
nothing.

**Change a customer's name or phone number after creating them.** Those are the
account holder's own to maintain. A run seeds them when it asks the account into
being and can never write them again; they travel outward only.

**Reach anything while nobody has handed the area over.** The machine route is
refused unless customer accounts are externally owned
([FR-ADM-10](requirements.md#fr-adm-10)) — and the operator's own file upload
([FR-ADM-12](requirements.md#fr-adm-12)) is refused exactly while they _are_. One
writer at a time, never both.

## The journeys

These are walked against a running API by `customer-sync-journeys.spec.ts` and
printed from the same literals. A cell that says nothing is not a gap: every
step asserts the whole observable state, so an unmentioned reading is asserted
_unchanged_ and an unmentioned message is asserted not to have been sent —
which is most of what these journeys are for.

<!-- generated:customer-sync-journeys -->
<details>
<summary><b>An account the source system asks for</b> — The case that separates an account existing from an account somebody can use. The exchange creates it and sends nothing anybody can sign in with — what reaches the customer is this platform’s own link, and until they follow it the account is theirs in name only.</summary>

**The exchange.** A customer the shop deals with in its own system, and no account here.

**Starting from.** Nothing has asked for this account yet.

**Which leaves it.** The run: `none`<br>The account: `none`<br>Can sign in: `no`<br>Waiting for a manager: 0

| #   | What happens                                       | Who      | What changes                                                                                                            |
| --- | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | The source sends the customer for the first time.  | system   | The run: `applied`<br>The account: `invited`<br>Mail to the customer: [`invitationCreated`](mail.md#invitation-created) |
| 2   | The customer follows the link and sets a password. | customer | The account: `active`<br>Can sign in: `yes`                                                                             |
| 3   | The source moves them onto another price list.     | system   | The run: `applied`                                                                                                      |
| 4   | The source sends the same thing again.             | system   | The run: `no change`                                                                                                    |

</details>

<details>
<summary><b>An account that loses its access, and gets it back</b> — Taking access away is the one move the exchange makes that a person has to agree to: it is staged, it is a manager’s to answer as well as an admin’s, and nothing happens to the account while it waits. Reinstatement is an ordinary run — putting somebody back is not a decision anybody needs protecting from.</summary>

**The exchange.** A customer with an account they use.

**Starting from.** The source sends the customer. They set a password from the link.

**Which leaves it.** The account: `active`<br>Can sign in: `yes`<br>Waiting for a manager: 0

| #   | What happens                                                     | Who     | What changes                                                                                                               |
| --- | ---------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | The source says the customer is no longer trading with the shop. | system  | The run: `waiting`<br>Waiting for a manager: 1<br>Mail to the shop: [`customerSyncWaiting`](mail.md#customer-sync-waiting) |
| 2   | The source repeats it before anybody has answered.               | system  | The run: `waiting`<br>Waiting for a manager: 1                                                                             |
| 3   | A manager reads it and applies it.                               | manager | The run: `applied`<br>The account: `disabled`<br>Can sign in: `no`<br>Waiting for a manager: 0                             |
| 4   | The customer starts trading again and the source says so.        | system  | The run: `applied`<br>The account: `active`<br>Can sign in: `yes`                                                          |

</details>

<details>
<summary><b>An account somebody registered here</b> — The deadlock the exchange would otherwise sit in. An account registered on the website carries no source key, so no row can match it — and while customer accounts are handed over, staff cannot approve it either. A run has to ask for it by address, once, and a person has to agree.</summary>

**The exchange.** Somebody who registered on the website and is waiting to be approved.

**Starting from.** They register on the website.

**Which leaves it.** The account: `pending`<br>Can sign in: `no`<br>Waiting for a manager: 0

| #   | What happens                                             | Who      | What changes                                                                                                                                          |
| --- | -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The source sends a customer with the same address.       | system   | The run: `applied`                                                                                                                                    |
| 2   | The source sends it again, this time asking to claim it. | system   | The run: `waiting`<br>Waiting for a manager: 1<br>Mail to the shop: [`customerSyncWaiting`](mail.md#customer-sync-waiting)                            |
| 3   | A manager reads what it would adopt, and applies it.     | manager  | The run: `applied`<br>The account: `invited`<br>Waiting for a manager: 0<br>Mail to the customer: [`invitationApproved`](mail.md#invitation-approved) |
| 4   | They set a password from the link and sign in.           | customer | The account: `active`<br>Can sign in: `yes`                                                                                                           |

</details>

<details>
<summary><b>An exchange that breaks, stays broken, and comes back</b> — The same change-of-state rule the catalog feed follows, in its own words and on its own state. A customer exchange that stops at midnight would otherwise write the same mail until somebody read one — and a mail about accounts that announced itself as a catalog update would be wrong in the only line an inbox shows.</summary>

**The exchange.** An exchange nobody has heard from yet.

**Starting from.** Nothing has asked for this account yet.

**Which leaves it.** The run: `none`<br>Waiting for a manager: 0

| #   | What happens                                  | Who    | What changes                                                                                                            |
| --- | --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | The source sends an ordinary customer export. | system | The run: `applied`<br>The account: `invited`<br>Mail to the customer: [`invitationCreated`](mail.md#invitation-created) |
| 2   | The next run breaks.                          | system | The run: `failed`<br>Mail to the shop: [`customerSyncFailed`](mail.md#customer-sync-failed)                             |
| 3   | It breaks again twenty minutes later.         | system | —                                                                                                                       |
| 4   | And again.                                    | system | —                                                                                                                       |
| 5   | The source is fixed and delivers.             | system | The run: `no change`<br>Mail to the shop: [`customerSyncRecovered`](mail.md#customer-sync-recovered)                    |

</details>
<!-- /generated:customer-sync-journeys -->

### What the columns mean

<!-- generated:journey-legend -->

- **The run** — What became of the submission: `applied`, `waiting` for a person, `failed`, `no change` where the source and the accounts already agreed, or `discarded`/`superseded` for a staged run that was answered or overtaken.
- **The account** — Where the account this journey is about stands, as staff see it: `none` before anything asks for it, then `pending`, `invited`, `active` or `disabled`. The exchange never deletes, so `gone` is not a reading it can produce (FR-ADM-15).
- **Can sign in** — Whether the person can actually get into the account with a password of their own, asked by signing in. It is the reading that separates an account the exchange _asked for_ from one somebody can use: an invited account has no password anybody holds (FR-ADM-13), and only the link it was sent creates one.
- **Waiting for a manager** — How many customer runs the panel counts as awaiting review — the figure on its customers row, asked of the same endpoint the panel asks. Counted from where this journey started, so it is this exchange’s contribution and not the deployment’s history. Customer runs are a manager’s work as well as an admin’s (FR-ADM-09), which is why the count is its own and not the catalog’s.
- **Mail to the shop** — What arrived for the people who run the shop at this step, named by the message it is. Worded about accounts rather than about the catalog, and sent on a change of state (FR-NOTIF-09) — so an empty cell is asserted, and is most of what these journeys are about.
- **Mail to the customer** — What arrived in the account holder’s own inbox. The exchange issues no credential, so the one thing it can send somebody is a link to set a password of their own — and it is sent by this platform, never carried in from outside.

<!-- /generated:journey-legend -->
