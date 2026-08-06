# 0032 — Customer accounts are staff-approved, and self-deletion anonymizes

**Status:** accepted · **Date:** 2026-08-06

## Context

FR-AUTH-01 lets a visitor register, but this is a B2B catalog: a registration is
a request to become a customer, not an account. Prices depend on the tier a
customer is put in (FR-AUTH-05, ADR 0031), and only staff know which tier a
given business belongs in — the relationship is negotiated offline, as it has
been for decades. So there is no self-service path from "filled in a form" to
"sees wholesale prices", and no tier can be inferred from anything the
registrant types.

That makes an account's _state_ a first-class thing, distinct from its role and
from its tier: a registered-but-not-yet-a-customer account must exist (so the
address is reserved and staff can see the request) while being unable to sign
in. FR-AUTH-06 adds the far end of the same axis — an account the user has
deleted, which must stop working without the row disappearing, because
`audit.actorId` and the `updatedBy` columns across the schema reference
`users.id` and the platform's own invariant is that past orders survive
account deletion.

The second question is what a registration has to _carry_. Approval is a human
decision with two parts, _is this a real customer_ and _which tier_, and an
address answers neither. There is also no back channel: a pending account
cannot sign in, so a manager who needs more information has to leave the app
entirely. The registration form is the only moment the applicant can be asked
anything, which is what settles the payload.

Alternatives considered: a boolean `approved` flag (cannot express the deleted
state, and a second boolean for that admits the nonsense combination of both);
deleting pending registrations outright and treating approval as account
_creation_ (loses the request itself, so a rejected or ignored registration
leaves no trace and the same address can retry endlessly unnoticed); hard
deletion with FK nulling for FR-AUTH-06 (erases who did what from the audit
trail, which NFR-SEC and the sync audit model both depend on).

## Decision

`users.status` is an enum — `pending | active | anonymized` — defaulting to
`pending`; a registration carries first name, last name, phone, a
`customerType` of `person | company` and, for a company, its business
registration number; approval by staff sets `active` together with `approvedAt`,
`approvedBy` and an explicitly chosen tier; self-deletion sets `anonymized` and
tombstones the identifying fields, keeping the row and its foreign-key
references intact.

## Rationale

One enum rather than flags because the states are mutually exclusive by nature
and each transition is a distinct event with a distinct actor: the registrant
creates `pending`, staff create `active`, the account holder creates
`anonymized`. There is no route back from `anonymized`, and a `pending` account
that is never approved simply stays a visible request.

The default is `pending`, the state that _cannot_ sign in. A column default is
what applies when a code path forgets to set the field, so the default has to be
the safe end: forgetting it locks an account out, which is a bug report, while
the opposite would silently hand a stranger a working account. The bootstrap
admin insert therefore names `status = 'active'` explicitly — it is the account
that approves others, so nobody approves it.

Status is enforced in three places, deliberately not one. Login refuses a
non-`active` account, and refuses it exactly the way a wrong password is
refused: a distinct "awaiting approval" message would confirm to anyone that an
address is registered, and the registration mail is where that gets explained —
to the address itself. `JwtAuthGuard` refuses too, because login-time checking
alone would leave an already-issued seven-day session working after an account
is anonymized; the guard already reads the DB row per request for exactly this
class of reason (role changes, `tokenVersion`). `OptionalAuthGuard` treats a
non-`active` session as anonymous instead of rejecting it, since its routes are
the public catalog and must stay open to guests.

The registration fields are chosen by what the approving manager does with them.
The name identifies; the registration number identifies a business against the
records the shop already keeps; the phone number is not identification but
_verification_ — it is what makes a confirming call possible before wholesale
prices are granted. A company **name** is deliberately not collected: the number
is the identifier and resolves to a name in a public registry, so asking for
both invites two spellings of one company. It can be added later without
touching this model.

The number's _format_ is jurisdiction-specific, so it is deployment
configuration (`companyIdInput.pattern`/`mask`/`example` in `deployment.json`),
never the shared contract — which enforces only the envelope: required exactly
when the type is `company`, trimmed, length-capped. The value is stored
unmasked, so it stays comparable with whatever the shop already has on file
regardless of how it is displayed, and the deployment's pattern is applied in
the API as well as in the browser, because a rule enforced only client-side is
not a rule.

`approvedBy` is a self-referencing FK with `ON DELETE SET NULL`, not a stored
name: staff accounts are themselves users, and the approver may later be
anonymized. Losing the pointer is acceptable; the audit log carries the durable
record.

Anonymizing rather than deleting is the same argument the platform already
makes about orders, applied to the account itself. The cost is honest: a
tombstoned row keeps a unique-email slot occupied by `deleted-<id>@invalid`, and
"delete my account" means something narrower than a naive reading — which is a
privacy-notice wording problem, not a schema one, since nothing identifying
survives.

## Consequences

- (+) Registration, approval and deletion are one column's transitions, so "may
  this account sign in?" has a single answer in a single place.
- (+) Approval is decidable from the request alone: the manager sees a name, a
  number to verify it on, and a registration number to match, without leaving
  the admin panel or emailing the applicant by hand.
- (+) Audit trails and `updatedBy` references survive account deletion, with no
  FK nulling and no orphan handling anywhere in the schema.
- (+) Approval is the natural moment to force a deliberate tier choice, which is
  what ADR 0031 needs (there is no default-tier row to fall into).
- (+) Nothing jurisdiction-specific reaches the codebase: a deployment in
  another country configures a different pattern and mask.
- (−) A pending row now holds real personal data, which makes purging a declined
  registration an obligation rather than housekeeping. A pending account has no
  audit references yet, so it can be hard-deleted — staff get that action.
- (−) Every future guard, and any query that lists "users", must remember that
  `pending` and `anonymized` rows exist and are not customers. The tier account
  counts already filter on both role and status.
- (−) An unapproved registration occupies its email address indefinitely. There
  is no expiry sweep; if pending rows pile up, that is a staff workflow signal,
  and a cleanup job can be added later without touching this model.
- (−) A user who registers and hears nothing has no in-app way to tell an ignored
  request from a rejected one. That is intentional (see the login rationale) and
  is handled by mail wording, not by the API.
