# The life of an account

This document is the companion to [the life of an order](order-lifecycle.md),
and exists for the same reason: account handling lives in pieces — a status
column, a password token, a set of staff guards, a handful of mail templates —
each readable on its own, none of them saying what a customer actually
experiences. Somebody changing one of them needs to see what else moves.

What follows is the logic **as it currently stands**, not the thinking behind
it: the statuses an account has, who moves it between them, what the account
holder is told at each step, and — the question these journeys were written
for — whether the password they chose still opens the account afterwards. The
reasoning lives in the ADRs; the requirements live in `requirements.md`.

**It has to be kept current.** Change a staff action, an account mail or the
rules around passwords, and this document changes with it. The journeys and the
legend are generated (`npx nx account-lifecycle`), as is the email gallery
(`npx nx mail-previews`), and CI fails if either is stale — the prose around
them is written by hand, and keeping it true is part of making the change.

Requirements: FR-AUTH-01…06 (registering, approval, roles, price groups,
switching accounts off, deleting them), FR-NOTIF-01/02 (what is written to
whom), FR-WORK-01 (what the staff panel flags). Decisions:
[ADR 0019](adr/0019-session-auth-argon2-jwt-cookie.md),
[ADR 0031](adr/0031-customer-tiers-and-price-lists.md),
[ADR 0032](adr/0032-account-lifecycle-and-staff-approval.md).

## The statuses

<!-- generated:account-statuses -->

An account is in exactly one of these: `pending` · `invited` · `active` · `disabled` · `anonymized`. Its role is one of `admin` · `manager` · `user`.
<!-- /generated:account-statuses -->

They are not a chain. An account moves between them by decisions, and each one
is somebody's:

| Status       | What it means                                                     | How it is reached                                            |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `pending`    | A registration nobody has decided on. It cannot sign in.          | Somebody registers (FR-AUTH-01).                             |
| `invited`    | A real account with no password of its own yet.                   | Staff approve a registration, or create an account outright. |
| `active`     | An account holding a password its owner chose.                    | The account holder redeems a link and chooses one.           |
| `disabled`   | Switched off. Nothing signs in, and every session in flight ends. | Staff switch it off (FR-AUTH-04).                            |
| `anonymized` | A tombstone: the row survives, the person in it does not.         | The account holder deletes their own account (FR-AUTH-06).   |

Two of those are ends, and they are not the same end. A **declined**
registration is deleted outright — nothing was ever an account, so there is no
row to keep and nobody to write to. An **anonymized** one is kept forever with
every personal field cleared, because the orders it placed still have to refer
to something.

**Role is not the price group.** The role (`admin`, `manager`, `user`) is
authorization. The price group is a separate field, assigned on approval, only
ever set on a customer account, and never shown to its owner.

## Switching an account off is not taking its password away

The rule worth stating on its own, because it is the one thing here that is
easy to get wrong from a long way away: **deactivation removes access, not the
credential**. The status is what refuses the sign-in and the token version bump
is what ends the sessions already in flight; the stored password is left
exactly as it was.

So switching an account back on returns the account its owner had, and neither
direction writes to them. That is deliberate. A customer who stopped ordering
for a season and is switched off while the shop tidies its list should not
receive "your account has been closed", and should not have to choose a new
password to come back — the shop's bookkeeping is not their news.

The exception is an account that never had a password to keep: one switched off
while still `invited` comes back `invited`, and staff send it a link. That is
also where an account deactivated by an older version of the platform lands,
since deactivation used to retire the credential.

**A password that should not survive is a password reset**, which is its own
action and available at any time — from the login form by its owner, or from
the account screen by staff, for somebody who rang the shop instead of using
the form. It is the same link and the same message either way.

## What gets written to an account holder

Every message the app can send is rendered in [the email gallery](mail.md).
Four of them belong to an account rather than to an order: the registration
receipt, the two invitations (approved, or created by staff), the password-reset
link, and the confirmation that an account was deleted.

Everything else staff do to an account is silent. Approving is not, because it
carries the way in; switching off, switching back on, re-tiering, editing a
phone number and changing a role all are.

## Journeys

An account's life is not one action but several, and what matters most is what
accumulates: what the account holder has been told, and whether the password
they chose still works. The journeys below are walked against the running API by
`apps/api-e2e/src/api/account-journeys.spec.ts`, and this section is rendered
from the same literals — so nothing here is described that is not checked, and
nothing checked goes undescribed.

**What the columns say.**

<!-- generated:journey-legend -->

- **Where it stands** — The account’s status as staff see it: `pending`, `invited`, `active`, `disabled` or `anonymized`. `gone` where the row no longer exists at all, which only a declined registration does.
- **Role** — What the account may do — `user`, `manager` or `admin`. Authorization only: it is not the pricing group.
- **Price group** — Which price list the account is read at, assigned on approval and invisible to its owner. `base` is the ordinary, permanent answer for a customer nobody put on a list.
- **Can sign in** — Whether the password this journey uses actually opens the account, asked by signing in. It is the reading the status is supposed to imply, checked rather than assumed.
- **Waiting for the shop** — Whether the account is in the queue the staff panel counts and its marker links to — registrations nobody has decided on. 🟡 means the next move is the shop’s.
- **Mail to the account holder** — What arrived in their inbox at this step, named by the message it is. An empty cell means nothing was sent, and is asserted — which is most of what these journeys are about.

<!-- /generated:journey-legend -->

**A blank cell is an assertion.** Every step asserts the whole observable state,
not only what it names: a reading nobody mentions is asserted unchanged, and a
mail nobody declares is asserted not to have been sent. Most of what these
journeys are about is the second half.

**These are examples, not a census.** The exhaustive per-action rules — who may
switch off whom, what the last admin cannot do, which statuses refuse which
action — are in `apps/api-e2e/src/api/users.spec.ts`. What is chosen here is the
state no single action reaches.

<!-- generated:account-journeys -->
<details>
<summary><b>A registration, approved</b> — The ordinary way a customer arrives: they ask, the shop decides, and only then is there an account to sign into. The price group is assigned in the same act and is never mentioned to them.</summary>

**The account.** An address nobody has registered.

**Starting from.** Nothing has happened to it yet.

**Which leaves it.** Where it stands: `gone`<br>Role: n/a<br>Price group: n/a<br>Can sign in: `no`<br>Waiting for the shop: —

| #   | What happens                                               | Who      | What changes                                                                                                                                                                         |
| --- | ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Somebody registers.                                        | customer | Where it stands: `pending`<br>Role: `user`<br>Price group: `base`<br>Waiting for the shop: 🟡<br>Mail to the account holder: [`registrationReceived`](mail.md#registration-received) |
| 2   | A manager approves it and puts them on the wholesale list. | manager  | Where it stands: `invited`<br>Price group: `wholesale`<br>Waiting for the shop: —<br>Mail to the account holder: [`invitationApproved`](mail.md#invitation-approved)                 |
| 3   | They follow the link and choose a password.                | customer | Where it stands: `active`<br>Can sign in: `yes`                                                                                                                                      |

</details>

<details>
<summary><b>A registration the shop turns down</b> — Declining is a deletion, not a status: nothing was ever an account. Nobody is written to — the shop is not obliged to tell a stranger why it will not trade with them, and a mail would be one.</summary>

**The account.** An address nobody has registered.

**Starting from.** Nothing has happened to it yet.

**Which leaves it.** Where it stands: `gone`<br>Waiting for the shop: —

| #   | What happens           | Who      | What changes                                                                                                                                                                         |
| --- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Somebody registers.    | customer | Where it stands: `pending`<br>Role: `user`<br>Price group: `base`<br>Waiting for the shop: 🟡<br>Mail to the account holder: [`registrationReceived`](mail.md#registration-received) |
| 2   | A manager declines it. | manager  | Where it stands: `gone`<br>Role: n/a<br>Price group: n/a<br>Waiting for the shop: —                                                                                                  |

</details>

<details>
<summary><b>An account the shop sets up</b> — A customer the shop already deals with off the platform, or a colleague. There is no registration to approve, so the account exists from the first click — with the wording that says where it came from.</summary>

**The account.** An address nobody has registered.

**Starting from.** Nothing has happened to it yet.

**Which leaves it.** Where it stands: `gone`<br>Can sign in: `no`

| #   | What happens                                | Who      | What changes                                                                                                                                                                  |
| --- | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A manager creates the account.              | manager  | Where it stands: `invited`<br>Role: `user`<br>Price group: `base`<br>Waiting for the shop: —<br>Mail to the account holder: [`invitationCreated`](mail.md#invitation-created) |
| 2   | They follow the link and choose a password. | customer | Where it stands: `active`<br>Can sign in: `yes`                                                                                                                               |

</details>

<details>
<summary><b>Switched off, and switched back on</b> — The one worth reading. Switching an account off takes its access away and nothing else: the password stays, so switching it back on returns the account its owner had — silently, with no mail in either direction. As far as they are concerned nothing happened, which is the point: a customer who stopped ordering for a season should not be greeted by a message telling them their account was shut.</summary>

**The account.** A customer who registered, was approved, and chose a password.

**Starting from.** They registered. A manager approved it. They chose a password.

**Which leaves it.** Where it stands: `active`<br>Can sign in: `yes`<br>Price group: `wholesale`

| #   | What happens                        | Who     | What changes                                     |
| --- | ----------------------------------- | ------- | ------------------------------------------------ |
| 1   | A manager switches the account off. | manager | Where it stands: `disabled`<br>Can sign in: `no` |
| 2   | A manager switches it back on.      | manager | Where it stands: `active`<br>Can sign in: `yes`  |

</details>

<details>
<summary><b>Switched off before it was ever used</b> — The exception to the one above. An account whose owner never chose a password has nothing to come back to, so switching it on lands it where a link can still be sent — and sending one is a deliberate act, not something a status change does behind a manager’s back.</summary>

**The account.** A registration that was approved and never opened.

**Starting from.** They registered. A manager approved it.

**Which leaves it.** Where it stands: `invited`<br>Can sign in: `no`<br>Price group: `base`

| #   | What happens                          | Who      | What changes                                                                    |
| --- | ------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| 1   | A manager switches the account off.   | manager  | Where it stands: `disabled`                                                     |
| 2   | A manager switches it back on.        | manager  | Where it stands: `invited`<br>Can sign in: `no`                                 |
| 3   | A manager sends them a link.          | manager  | Mail to the account holder: [`invitationApproved`](mail.md#invitation-approved) |
| 4   | They follow it and choose a password. | customer | Where it stands: `active`<br>Can sign in: `yes`                                 |

</details>

<details>
<summary><b>Locked out, and let back in</b> — Somebody who has forgotten their password rings the shop as readily as they use the form, so staff can send the link on their behalf. It is the same link and the same mail either way — and the account is untouched until they actually choose a new password.</summary>

**The account.** A signed-up customer who has forgotten their password.

**Starting from.** They registered. A manager approved it. They chose a password.

**Which leaves it.** Where it stands: `active`<br>Can sign in: `yes`

| #   | What happens                                              | Who      | What changes                                                          |
| --- | --------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| 1   | They ask for a link from the login form.                  | customer | Mail to the account holder: [`passwordReset`](mail.md#password-reset) |
| 2   | A manager sends the same link, because they rang instead. | manager  | Mail to the account holder: [`passwordReset`](mail.md#password-reset) |
| 3   | They follow it and choose a password.                     | customer | Where it stands: `active`<br>Can sign in: `yes`                       |

</details>

<details>
<summary><b>Closed by its owner</b> — Deleting an account anonymizes it rather than removing it (FR-AUTH-06): the past orders it placed have to keep referring to something. What goes is everything that says who the person was — including the email, which is why the row is read by id from here on.</summary>

**The account.** A signed-up customer who wants their account gone.

**Starting from.** They registered. A manager approved it. They chose a password.

**Which leaves it.** Where it stands: `active`<br>Can sign in: `yes`

| #   | What happens                                 | Who      | What changes                                                                                                                  |
| --- | -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | They delete the account from their own page. | customer | Where it stands: `anonymized`<br>Can sign in: `no`<br>Mail to the account holder: [`accountDeleted`](mail.md#account-deleted) |

</details>
<!-- /generated:account-journeys -->
