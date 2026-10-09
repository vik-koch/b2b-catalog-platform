# 0066 — Confirm a sign-in through the phone

**Status:** accepted · **Date:** 2026-10-07

## Context

[FR-AUTH-12](../requirements.md#fr-auth-12) lets a deployment add a second step
to a sign-in. Some jurisdictions restrict how a site may authenticate its users,
and elsewhere a second factor is simply wanted.

Every account already carries a mobile number: registration asks for one
([FR-AUTH-01](../requirements.md#fr-auth-01)), so staff can call before they
approve. Proving that the person holds that number asks them for nothing they
have not already given. Signing in through an external identity provider was
considered and left for later. It makes an account with a third party a
condition of ordering, and it needs a linking flow at every place an account
can start. An authenticator app was considered too. It has nothing to deliver:
the account holds a secret set up from a QR code, and the platform checks the
code itself. That takes a setup screen, recovery codes and a staff reset for a
lost device.

A number can be proven in two directions. The shop can send a code to it, which
the person types in. Or the person can call a number the shop shows, from their
own phone, and the provider confirms that the call came from the expected
number. The two cost differently depending on the market. The operators set the
price of a business message. Where they require a registered sender name, each
operator charges a monthly fee for it before the first message goes out, which
outweighs a small shop's whole volume. A call check needs no sender name,
leaves nothing to type, and is free for the caller. But the site learns of the
call some seconds later, not when it asks.

## Decision

After the password, the person proves they hold the account's number, and the
session starts once they have. There are two kinds of proof: a **code** sent to
the number and entered on the site, or a **call** from the number to one the
site shows. The deployment's provider decides which kind applies.
`deployment.json` sets the policy (`signInStep`):

- a `mode` of `off`, `once` or `always`;
- the `roles` that take the step;
- the roles an admin may exempt.

An exemption belongs to one account and is stored on it. A session renews while
it is used and ends after `session.idleDays` without use. Where
`signInStep.trustDeviceDays` is above zero, the person may have the browser
remembered, and a remembered browser skips the step.

## Rationale

**Two kinds, two ports; the platform decides.** The kinds differ in who
confirms and when, so each has its own port, not one interface stretched
over both:

- **The code port.** `send({ phone, code, text })` returns the code to expect.
  An SMS adapter sends the text and returns the code it was given. An adapter
  whose provider makes its own code returns that one.
- **The call port.**
  - `start({ phone })` returns the number to call, a reference, and how long
    the check stays open.
  - `status(reference)` answers `pending`, `confirmed` or `expired`.

`SignInStep` picks the kind where the step begins, and everything else is
shared. Both ports fail in the same two ways: the number cannot be reached, or
the provider is unavailable. An unavailable provider stops the sign-in, and
nothing skips the step. Every request to a provider is synchronous and never
queued like mail, because the person is waiting for the answer.

**The adapters.** The public repository ships a mail adapter for each kind.
Dev and the demo use them: dev's mail catcher shows the mail, and on the demo
the visitor's own inbox does.

- For a code, the mail carries the code.
- For a call, it carries a link that does what the call would.

Whoever reads the mailbox can also reset the password, so neither is a second
factor, and the configuration docs say so.

The public repository also ships an HTTP adapter for each kind. Each reads
`422` as a refused number, and any other answer that is not a success as an
unavailable provider.

- **Codes:** `SIGN_IN_CODE_URL` takes `{ phone, code, text }`.
- **Calls:** `SIGN_IN_CALL_URL` takes `POST /checks { phone }` and
  `GET /checks/{reference}`.

A real provider sits behind the URL in a deployment's own sidecar, with an
optional bearer token, so no provider is named here. A deployment sets at most
one of the two URLs: setting one is the whole switch, and setting both stops
the boot. Which adapter is in use is logged at boot.

**The browser asks, the API checks.** The code screen posts the code. The call
screen asks the API every few seconds whether the call has come, and the API
reads the check's status from the sidecar. The reference is held only in the
account's row and never reaches the browser, so nobody can present someone
else's check. A push from the provider was considered. The browser would still
have to ask the API, and the push would need a public route to the sidecar. A
confirmed check completes one sign-in and is removed, so a second tab polling
at the same time finds nothing pending.

**One proof at a time per account, and the limits hold per account.**

- A code lives ten minutes and survives three wrong entries.
- A call check stays open as long as the provider keeps it open.
- A call leaves nothing to guess, because the provider matches the caller's
  number.

The wait before the next code or check grows with the ones already sent: a
minute after the first, two after the second, and after the third a pause of
half an hour. The wait follows the sends, not the wrong entries, because
each send is what costs money, and wrong entries are already capped per code.
That leaves a guesser nine tries in a million per half hour.

The account's row outlives its code or check until the pause is over.
Entering the password again therefore does not reset the count, and neither
does changing the number while confirming. A code or check that is still open
is not replaced. Every answer about the step states the wait, and the screen
counts it down.

Nothing is sent or started until the password is correct, so none of this can
be reached by someone who does not have it. Someone who does can keep the
holder in the pause, but the remedy for that is a new password, not a looser
limit.

Between the password and the step, the visitor holds a short-lived cookie
signed with a key derived from the session secret. It carries `tokenVersion`,
so it cannot be presented as a session, and a password change or a
deactivation in between ends it.

**Policy in config, exceptions in the database.** Which roles take the step,
and whether an account may be exempted from it, follows from the rule a
deployment is under. That is the operator's decision, not a staff member's.
Making customers exemptable or not is therefore a config value, and a click in
the admin panel cannot go past it. Exempting a single account is day-to-day
work, so it is a column with who set it and when.

**`once` is a mode, not a weaker `always`.** It confirms that the holder has the
number and never asks again. It is phone verification rather than a second
factor, and the configuration docs say so.

**Staff set the number; the holder only confirms it.** Once the step depends on
it, the number is how the account signs in, as the email address is, and the
holder changes neither.

A self-service change was considered. Proof of the new number shows who holds
the new phone, not who owns the account. Anyone at a signed-in browser could
therefore move the step to a phone of their own. Guarding against that takes
proof from the old number too, which fails exactly when the old phone is lost.
A shop of a few hundred business customers who talk to a manager anyway does
not need that machinery. Nothing important hangs on the account: a lost phone
is a call to the shop.

So a sign-in never asks for a number. The step uses the account's own number.
Where that number cannot be used, the sign-in stops with a message to contact
the shop, and the account's admin page says the same. That covers:

- no number at all;
- one not in a readable form;
- one the provider refuses.

The account gets `phoneConfirmedAt`, written together with the number when the
step completes. A database trigger clears it whenever a write changes the
number without setting it too. A number changed by staff, by a sync or by
anonymization is therefore confirmed again by its holder's next completed step.
This also covers accounts that existed before the switch was turned on.
Numbers stay non-unique.

**Only a number in canonical form takes the step** (`+` country code and
digits). The browser already stores numbers that way, but the API accepts any
string. Every path where a person enters an account's number now applies the
deployment's phone rule on the server and refuses a number the rule cannot
read. A number from an external system is stored as it came, and counts as
unconfirmed if it is not canonical, so a bad source row never blocks a sync run.

**The session slides.** A fixed seven-day session would ask a regular customer
to repeat the step every week. That is the cost the step adds, both to the shop
and to the customer. A token that has been used and is more than a day old is
reissued. The session therefore ends after `session.idleDays` without use, and
`tokenVersion` still ends it immediately. The default is the old seven days, so
a deployment without the step sees no change, and one with it sets a longer
stretch next to `signInStep`.

**A remembered browser replaces the phone, not the password.** It is a second
signed, httpOnly cookie holding only the account and an expiry. It is set only
when the person ticks the box on the step's screen.

A long `idleDays` was the alternative. But then the session cookie is the whole
sign-in: a browser left signed in on a shared computer stays usable for months,
and signing out brings the step back. Kept apart, the session still expires on
its usual schedule, and the remembered browser skips only the step.

The cookie keeps its own validity, separate from `tokenVersion`, so a password
change or a sign-out leaves it standing. A changed number, a deactivation or a
deletion does not: each moves the account's `devicesTrustedSince`, and any
cookie issued before it is ignored. `trustDeviceDays` defaults to 0, so a
deployment whose rule asks for the step at every sign-in gets exactly that.

## Consequences

- (+) No customer needs an account elsewhere. The number staff already used to
  vet the registration becomes the one the account signs in with.
- (+) A deployment chooses the kind that its market prices sensibly, and swaps
  a provider by replacing a sidecar, without a platform release.
- (+) Nothing is sent or started before a correct password, so anonymous
  requests cannot drain the shop's balance.
- (+) Server-side phone canonicalisation closes a gap that existed before the
  step: API clients and external systems could store numbers in any form.
- (−) Each code or check may cost money. At `always`, the cost grows with the
  number of sign-ins, and `idleDays` controls how many there are.
- (−) A call needs a phone that can dial out, and on a computer the person dials
  the shown number by hand.
- (−) A holder who loses the number, or whose number staff change to one they
  do not hold, cannot sign in until staff correct it or exempt the account.
- (−) Colleagues sharing a phone both complete their step on it.
- (−) Someone who knows the password and uses a remembered browser skips the
  step, which is the point of remembering it. A shared computer therefore
  depends on the box being left unticked.
- (−) The provider is a processor of the number, which the deployment's own
  privacy notice has to state.
- (−) Sign-in through an identity provider and through an authenticator app stay
  unbuilt. Either could later be added as another kind of second step.
