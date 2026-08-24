# 0041 — Suggest a company through the same sidecar, and never let it decide

**Status:** accepted · **Date:** 2026-08-24

## Context

A business account is identified by its registered name _and_ its registration
number (FR-AUTH-01), and both are what staff approve on: the name is what they
match against their own customer records, the number is what they can check it
against. Typing them is the slowest part of registering, and the number is the
field most likely to be entered wrongly — the same problem ADR 0040 solved for
an address.

The registration form no longer asks which _kind_ of number is being entered: it
is one plain field measured against every shape the deployment accepts. That
leaves one field a provider could answer for, and one it could answer _with_ —
several providers that suggest addresses also suggest organisations, by name or
by number, and return a registered address with them.

Requirements: FR-AUTH-09/10, NFR-SEC-08.

Constraints are ADR 0040's, unchanged: no provider is universal, a deployment
must work with none configured at all, and every keystroke that leaves the
deployment is personal data going to a processor. One more is specific to this
subject — a registry answer _looks_ authoritative in a way an address suggestion
does not, which makes it tempting to treat as a fact about the customer.

Alternatives considered: widening the address port's answer to carry company
fields; a second sidecar with its own URL; requiring a suggestion to be picked
before a registration is accepted; looking the company up server-side at
registration or at approval; and storing the provider's answer as the account's
own name rather than the customer's.

## Decision

Company suggestion sits behind its own `PartySuggestionPort`, reached through the
**same** deployment sidecar at a second path and switched on by the same single
environment variable (renamed `SUGGESTION_SIDECAR_URL`). A suggestion **fills**
the two company fields and never decides them: nothing gates a registration on
one having been picked, and what the customer submits is what is stored and
reviewed. Where a picked suggestion identifies a **legal entity** and carries a
registered address, that address is created as the account's first saved
address, from the row the customer picked rather than from a second lookup.

## Rationale

**Its own port, the same container.** A company and an address are different
subjects with different answers, so widening `AddressSuggestionPort` would make
one interface that means two things and one adapter that must implement both to
implement either. They are the same _provider_ though, with one credential and
one processing agreement, so a second sidecar would be a second container, a
second secret and a second thing to deploy for no gain. Two ports, one process,
one URL. A sidecar that predates the new path answers 404, which the adapter
turns into an empty list — so an older sidecar degrades to "no company
suggestions" on its own, with no capability flag to configure and nothing to keep
in step.

**Never authoritative**, for three reasons that are each sufficient. A provider
serves one jurisdiction, so a customer outside it would be blocked by a rule that
exists to help them. A registry lags: a company registered last week, or renamed
last month, fails a check that its own paperwork passes. And a deployment with no
sidecar must behave identically — an authoritative field would be one that works
in some deployments, for some customers, on a good day, which is not a rule but a
weather report. The quota case makes the same point in miniature: the day the
provider's daily limit runs out, registration must be exactly as possible as it
was the day before.

What a suggestion is _for_, then, is typing less and mistyping less. The account
still carries what the customer wrote, staff still approve on it, and the
provider's spelling never silently replaces the customer's own.

**The seeded address comes from the browser, not the server.** The components of
the picked row are already in the browser, so creating the address from them
costs no second metered call, cannot go stale between picking and approving, and
— the part that matters — is an address the customer _chose_, not one the shop
went and found out about them. A server-side lookup at approval would be all
three the other way round.

**Only for a legal entity.** An individual entrepreneur's registered address is
usually their home. Storing somebody's home address, from a registry, because
they signed up for a shop account, is not a convenience, and providers
distinguish the two — so where the entity type is missing or individual, no
address is seeded. What is created is an **ordinary** row: visible, editable and
removable once the account is active, with no verified flag and no lock. Checkout
shows the address and a manager reviews every order, so there is no path by which
a wrong seeded address reaches an invoice unseen.

## Consequences

- (+) Registering a business is two fields the customer mostly picks rather than
  types, and the number arrives in a shape the deployment's patterns accept.
- (+) Staff get a name and a number that agree with a registry more often, which
  is what makes an approval decidable.
- (+) A business account can arrive with its billing address already filled in,
  from one selection.
- (+) The second subject cost one interface and one path, not a second container,
  credential or configuration key.
- (−) A second metered endpoint, with the same billing exposure as the first, and
  a second reason for a deployment's privacy notice to name a processor.
- (−) The sidecar contract now has two shapes to keep, and adding a component to
  either is a change the platform must learn before a sidecar may send it.
- (−) A customer whose company the registry does not know types both fields by
  hand, which is a worse experience for exactly the customers most likely to be
  new.
- (⚠) Nothing may require a suggestion to have been picked, in any form: no
  hidden field, no client-side rule, no refusal at approval.
- (⚠) A seeded address is created only for a legal entity, and is an ordinary
  editable row — never marked verified and never treated as one.
