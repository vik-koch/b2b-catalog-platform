# 0034 — Nobody is sent a password: single-use links, length over composition

**Status:** accepted · **Date:** 2026-08-06

## Context

Iteration 4 needs a password to exist for accounts that never had one
(FR-AUTH-01/03: an approved registration, and an account staff create outright)
and to be replaceable for accounts that do (FR-AUTH-02, FR-AUTH-08). The obvious
implementation — generate one, mail it, force a change on first sign-in — is
what ADR 0032's first draft assumed, and it is what the existing bootstrap admin
does, because a deploy pipeline has nowhere else to put a first credential.

It is also the weakest part of the design. A mailed password is a plaintext
credential that comes to rest in at least two mailboxes, usually unencrypted, and
stays valid until someone acts; `mustChangePassword` is a prompt, not a control.

The second question is what a password must _look like_. The instinct is
composition rules — a digit, a symbol, a capital — and the instinct is wrong:
NIST 800-63B §5.1.1.2 and OWASP ASVS V2 both recommend against them, because they
reliably produce `Password1!` (predictable, and on every published list) while
punishing passphrases that are far stronger. What those standards recommend
instead is a length floor and a check against known-common passwords.

Alternatives considered: mailing a generated password with a forced change (the
plaintext-in-mailbox problem above); a separate token table per purpose,
invitation and reset (two tables and two code paths for one mechanism whose only
difference is a TTL and some wording); a `purpose` column on one table (rejected
in ADR 0032 — the account's own state already answers it, and a stored purpose
would misword an expired invitation followed by a reset request); and a vendored
top-10k blocklist compiled into the image (see below).

## Decision

Every password is chosen by the account it belongs to, through a single-use,
time-limited link (`password_tokens`, SHA-256 of the token, 7 days for an
invitation and 1 hour for a reset); passwords must be at least 12 characters,
carry **no** composition requirements, and are refused when they appear on a
deployment-configured blocklist, form a trivial pattern, contain the account's
own address or the shop's name, or equal the password being replaced.

## Rationale

The link is the credential, so it is treated like one: 256 bits of randomness,
stored only as a SHA-256 hash, spent by a conditional update so two clicks
cannot both win, and invalidated when a newer link is issued or the password
changes by any route. SHA-256 rather than argon2 is deliberate and is not a
weakening: the token has no low-entropy input to protect, and a _deterministic_
hash is what allows the link to be looked up by itself instead of carrying a row
id beside the secret. Unknown, already-used and expired are one answer, so a
guessed token learns nothing from which failure it gets.

Invitation and reset share one table because they are one mechanism. What
differs is the TTL — an invitation waits for someone to read their mail after a
staff member approved them during business hours, a reset answers someone
standing at the form — and the wording, which is derived from the account's
status rather than stored (ADR 0032).

Redemption signs the visitor in. They have just proved control of the address
and chosen the password; a login form at that point is ceremony, and ceremony is
where people paste passwords into the wrong field.

On the rules: 12 characters is the floor because length is what resists
guessing, and no composition rule survives contact with a user who wants to get
past it. The blocklist is what actually stops `hello123` — and it is **mounted
configuration, not code**, because which passwords are common depends on the
language a deployment's customers think in. A list compiled into this repo
would be either English-only or an arbitrary mix of languages, and either way it
would encode one deployment's locale into a codebase that is deliberately
locale-neutral. Matching strips trailing digits and non-letters first, since a
blocklist that only matches whole strings is defeated by the first thing anyone
tries when refused.

Two rules are about the account rather than the password. Containing the
account's own address is refused — except for role mailboxes (`admin@`,
`info@`), where the local part names a job rather than a person and forbidding
it is noise. Equalling the current password is refused because FR-AUTH-08's
forced change exists precisely to replace a handed-out password, and a change
that changes nothing would defeat it.

A link outlives the reason it was sent, so anything that ends an account's
ability to sign in revokes the outstanding ones too: a password change by any
route, and deactivating the account (ADR 0032). Otherwise the strongest thing
the platform does — retiring the password and ending the sessions — is undone
by a mail nobody has read yet, and a deactivated account walks back to `active`
through its own inbox.

The policy is applied wherever a password is set — the link and the
change-password form both — because a rule that guards one of two doors guards
neither. That surface has two distinct 400s (the _current_ password was wrong;
the _new_ one was refused), so the response carries a `code`: a client that
guesses tells the user to correct a field that was never wrong.

## Consequences

- (+) No password ever exists in a mailbox, a log, or a staff member's hands.
- (+) One token mechanism serves invitation, reset and any future "prove you
  control this address" flow; FR-AUTH-02 becomes a second way to mint a link.
- (+) The blocklist can be as strong as a deployment wants — a published top-N
  list is a file swap, no release involved.
- (+) Password rules live in one service, applied by every path that sets one.
- (−) An account with no usable password depends on mail delivery to become
  usable at all. Staff can re-send, but a shop with broken SMTP cannot onboard
  anyone, where a mailed password would have failed the same way and left the
  password valid.
- (−) The bootstrap admin still receives a password it did not choose, from the
  deploy configuration, and that password bypasses the policy because it is
  hashed by a one-shot before the app exists. `mustChangePassword` remains for
  exactly this account.
- (−) A deployment that configures no blocklist gets only the mechanical rules,
  and nothing in the app says so. The committed demo list is short by design;
  it is a starting point, not a policy.
