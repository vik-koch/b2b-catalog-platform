# 0066 — Confirm a sign-in with a code sent to the phone

**Status:** accepted · **Date:** 2026-10-07

## Context

[FR-AUTH-12](../requirements.md#fr-auth-12) lets a deployment add a second step
to a sign-in. Some jurisdictions restrict how a site may authenticate its users,
and elsewhere a second factor is simply wanted.

Every account already carries a mobile number: registration asks for one
([FR-AUTH-01](../requirements.md#fr-auth-01)), so staff can call before they
approve. A code sent to that number asks the customer for nothing they have not
already given. Signing in through an external identity provider was considered
and left for later. It makes an account with a third party a condition of
ordering, and it needs a linking flow at every place an account can start.
An authenticator app was considered too. It has nothing to deliver: the account
holds a secret set up from a QR code, and the platform checks the code itself.
That takes a setup screen, recovery codes and a staff reset for a lost device.

The cost of a code is the message. A business message with a shared sender name
costs roughly the same through any provider, because the operators set the
price. A flash call is cheaper but harder to use: the code is the last digits
of a missed call.

## Decision

After the password, the platform sends a code to the account's confirmed number
through a delivery port, and starts the session once the code is entered.
`deployment.json` sets the policy (`signInStep`): a `mode` of `off`, `once` or
`always`, the `roles` that take the step, and the roles an admin may exempt.
An exemption belongs to one account and is stored on it. A session renews while
it is used and ends after `session.idleDays` without use. Where
`signInStep.trustDeviceDays` is above zero, the person may have the browser
remembered, and a remembered browser skips the code.

## Rationale

**The port delivers; the platform decides.** `send({ phone, code, text })`
returns the code to expect. An SMS adapter sends the text and returns the code
it was given. A flash-call adapter would ignore it and return the provider's.
The platform keeps everything else: the code's hash, expiry, attempts, resend
limits and the refusal codes. The port fails in two ways: the number cannot be
reached, or the provider is unavailable. An unavailable provider stops the
sign-in. Nothing skips the step. Sending is synchronous and never queued like
mail, because the person is waiting for it.

The public repository ships two adapters. One sends the code to the account's
email address, which is what dev and the demo use: dev's mail catcher shows
it, and on the demo the visitor's own inbox does. Whoever reads the mailbox can
also reset the password, so this is not a second factor and is documented as
such. The other posts `{ phone, code, text }` to `SIGN_IN_CODE_URL` with an
optional bearer token, and reads `422` as a refused number and anything else
that is not a success as an unavailable provider. A real provider sits behind
that URL in a deployment's own sidecar, so no provider is named here. Setting
the URL is the whole switch, and which way it resolved is logged at boot.

**One code per account, and the limits hold per account.** A code lives ten
minutes and survives three wrong entries. The wait before the next code grows
with the codes sent: a minute after the first, two after the second, and after
the third a pause of half an hour. The wait follows the messages rather than
the wrong entries, because each message is what costs money, and wrong entries
are already capped per code. That leaves a guesser nine tries in a million per
half hour. The account's row outlives its code until the pause is over, so
entering the password again does not reset the count, and neither does
changing the number while confirming. A code that is still usable is not sent
again. Every answer about a code states the wait, which the code screen counts
down.

Codes go out only after a correct password, so none of this can be reached by
someone who does not have it. Someone who does can keep the holder in the pause,
but the remedy for that is a new password, not a looser limit.

Between the password and the code, the visitor holds a short-lived cookie
signed with a key derived from the session secret. It carries `tokenVersion`,
so it cannot be presented as a session, and a password change or deactivation
in between ends it.

**Policy in config, exceptions in the database.** Which roles take the step, and
whether an account may be exempted from it, follows from the rule a deployment
is under. That is the operator's decision, not a staff member's. Making
customers exemptable or not is therefore a config value, and a click in the
admin panel cannot go past it. Exempting a single account is day-to-day work,
so it is a column with who set it and when.

**`once` is a mode, not a weaker `always`.** It confirms that the holder has the
number and never asks again. It is phone verification rather than a second
factor, and the configuration docs say so.

**Staff set the number; the holder only confirms it.** Once codes go to it,
the number is how the account signs in, as the email address is, and the holder
changes neither. A self-service change was considered: a code to the new number
proves the new phone, not the owner, so anyone at a signed-in browser could move
the codes to a phone of their own, and guarding against that takes a code to the
old number too, which fails exactly when the old phone is lost. A shop of a few
hundred business customers who talk to a manager anyway does not need that
machinery, and nothing important hangs on the account: a lost phone is a call
to the shop.

So a sign-in never asks for a number. The code goes to the account's own, and
where there is none a code can reach (none at all, one not in a readable form,
or one the provider refuses) the sign-in stops with a message to contact the
shop, and the account's admin page says the same. The account gets
`phoneConfirmedAt`, written by the code check together with the number. A
database trigger clears it whenever a write changes the number without setting
it too, so a number changed by staff, by a sync or by anonymization is confirmed
again by the next code its holder enters. This also covers accounts that existed
before the switch was turned on. Numbers stay non-unique.

**Codes go only to a number in canonical form** (`+` country code and digits).
The browser already stores numbers that way, but the API accepts any string.
Every path where a person enters an account's number now applies the
deployment's phone rule on the server and refuses a number the rule cannot
read. A number from an external system is stored as it came and counts as
unconfirmed if it is not canonical, so a bad source row never blocks a sync run.

**The session slides.** A fixed seven-day session would ask a regular customer
for a code every week. That is the cost the step adds, both to the shop and to
the customer. A token that has been used and is more than a day old is reissued.
The session therefore ends after `idleDays` without use (30 unless configured),
and `tokenVersion` still ends it immediately.

**A remembered browser replaces the phone, not the password.** It is a second
signed, httpOnly cookie holding only the account and an expiry, set only when the
person ticks the box on the code screen. A long `idleDays` was the alternative,
but then the session cookie is the whole sign-in: a browser left signed in on a
shared computer stays usable for months, and signing out brings the code back.
Kept apart, the session still expires on its usual schedule and the remembered
browser skips only the code. The cookie keeps its own validity, separate from
`tokenVersion`. A password change or a sign-out does not affect what the cookie
stands for. A changed number, a deactivation or a deletion does, so each of
those moves the account's `devicesTrustedSince`, and any cookie issued before it
is ignored. `trustDeviceDays` defaults to 0, so a deployment whose rule asks for
a code at every sign-in gets exactly that.

## Consequences

- (+) No customer needs an account elsewhere, and the number staff already used
  to vet the registration becomes the one they sign in with.
- (+) A provider is swapped by replacing a sidecar, without a platform release.
- (+) Messages are sent only after a correct password, so the shop's message
  balance cannot be drained by anonymous requests.
- (+) Server-side phone canonicalisation closes a gap that existed before the
  step: API clients and external systems could store numbers in any form.
- (−) Each message costs money. At `always`, cost grows with the number of
  sign-ins, and `idleDays` controls how many there are.
- (−) A holder who loses the number, or whose number is changed by staff to one
  they do not hold, cannot sign in until staff correct it or exempt the account.
- (−) Colleagues sharing a phone both receive their codes on it.
- (−) Someone who knows the password and uses a remembered browser skips the
  code, which is the point of remembering it. A shared computer therefore
  depends on the box being left unticked.
- (−) The provider is a processor of the number, which the deployment's own
  privacy notice has to state.
- (−) Sign-in through an identity provider and through an authenticator app stay
  unbuilt. Either could later be added as another kind of second step.
