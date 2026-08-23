# 0040 — Suggest addresses through a port, and match them against configured delivery zones

**Status:** accepted · **Date:** 2026-08-23

## Context

ADR 0039 makes checkout a form that is mostly already answered. The exception is
the address: a new one is the slowest thing a customer types, and it is the field
most likely to be entered wrongly.

It is also load-bearing. Delivery rules differ by area — a free-delivery minimum
of one amount in the city, another in the surrounding area, another beyond it —
so the address is not only text to store and print. It decides which rule
applies, and a customer who cannot see that rule before ordering finds out from a
manager afterwards, which is the phone call this whole iteration exists to avoid.

Requirements: FR-CART-07/11, NFR-SEC-08.

Constraints. No suggestion provider is universal: the one with the best data in
one country is weak or unavailable in another, and their answers differ in
**shape** as much as in quality — a single formatted line from one, structured
components from another, an opaque registry identifier from a third. A
deployment must work with no provider configured at all. And a half-typed
address is personal data leaving the deployment, which is a processor
relationship, not an integration detail.

Alternatives considered: bundling a postal dataset with the app; relying on
browser autofill alone; matching zones by city name; computing an actual delivery
price rather than stating a threshold; and holding zones in the database from the
start.

## Decision

Address suggestion sits behind an `AddressSuggestionPort` whose adapter is chosen
by deployment configuration, defaults to none, and is proxied through the API so
no credential reaches the browser; a suggestion returns **structured components**
rather than one line. Delivery zones are entries in `deployment.json`, matched by
postal code with an optional city fallback, first match wins, each carrying an
**advisory** free-delivery minimum that is shown at checkout and snapshotted onto
the order.

## Rationale

**A port with a regional adapter** is the same rule the platform already applies
to region-specific integrations: the interface is public, the concrete adapter is
a deployment's own business. It is not ceremony here — providers genuinely do not
generalise, so an implementation baked into the checkout form would have to be
replaced rather than swapped in a second deployment. The default is **no
adapter**: the field is an ordinary text input, everything still works, and
nothing about an order depends on a suggestion having happened. That is what
keeps the feature optional rather than load-bearing.

**Structured components are the substance, not the convenience.** Because the
delivery rule keys off the postal code, a suggestion that returns one formatted
line is nearly useless — the app would have to parse back out what the provider
already knew. So the port's contract is a display label plus components (country,
postal code, region, city, street, house), which drop straight into the columns
the address book already has, and which make the postal code trustworthy enough
to decide a rule on. Typing by hand stays possible and the check degrades to
whatever the customer entered.

**Every call is proxied through the API**, never made from the browser. The
credential stays server-side, calls are rate-limited and cacheable, and there is
one place to turn the whole thing off. A suggestion endpoint is also a metered
one: unbounded browser access to a per-call provider is a billing incident
waiting to happen, which is why NFR-SEC-08 caps query length and rate rather than
leaving it to the provider's own quota.

**The privacy cost is named rather than absorbed.** Keystrokes containing a
person's address go to a processor, so a deployment that enables an adapter takes
on a processing agreement and a line in its privacy notice. The no-op default and
the possibility of a self-hosted adapter are the two ways out, and the decision
to leave the deployment is a deployment's to make explicitly — never a default.

**Zones match on postal code, not city name.** City text is misspellable,
translatable and ambiguous: a metropolitan area is not a city, districts carry
their own names, and a rule that turns on string equality with something a
customer typed will be wrong the first week. A postal code is a normalized token,
and a range expresses "the city" and "the area around it" without enumerating
every place name in either. A `cities` list stays available as a fallback for
codes that do not separate the two, or for a jurisdiction where they do not
correspond.

Matching is **first match wins over an ordered list**, most specific first, with
a final catch-all so that no address is unclassified — an address outside every
zone still gets an answer, and that answer is "a manager will confirm this",
which is true. The comparison has one trap worth pinning: codes are compared as
**fixed-width strings**, never as integers, or a leading zero is lost and a whole
region reclassifies; a range is therefore valid only between codes of equal
length, and formats that are not numeric use prefixes instead. Both are checked
when the config loads, which fails the boot rather than shipping a rule nobody
can trigger.

**The threshold is advisory and never a gate.** It says what the free-delivery
minimum is in the resolved zone and whether this order meets it; it does not
block submission, and it does not compute a delivery price. Every order is
reviewed by a manager who arranges delivery by phone anyway, so a hard rule here
would refuse orders the shop would have accepted, and a computed price would be a
second pricing system with no source of truth behind it. The resolved zone key
and the threshold as it read at the time are **snapshotted onto the order**,
because config is editable and an order must stay readable.

**Configuration now, database later.** Zones are per-deployment operational facts
of the same class as `locations` and the currency, so they start in
`deployment.json` beside them. Entries are keyed, which is what makes moving them
into an admin-editable table later additive rather than a migration of free-text
rules into structured ones.

## Consequences

- (+) Entering an address collapses to a few keystrokes and one selection, in the
  one place ADR 0039's prefill could not help.
- (+) The postal code becomes trustworthy, so the delivery rule can be decided
  from it rather than guessed from prose.
- (+) A customer sees the free-delivery threshold that applies to them before
  ordering, not from a manager afterwards.
- (+) A deployment with no provider configured behaves exactly as before, and
  turning one on is a config change rather than a release.
- (+) Zones and offices live together in configuration, so a deployment changes
  its delivery rules without a migration.
- (−) Provider quality varies by region and a selected suggestion is stored as
  though authoritative; the components stay editable afterwards for exactly that
  reason.
- (−) Enabling an adapter creates a processor relationship, with the agreement
  and the privacy-notice wording that go with it.
- (−) Suggestions cost per call, so caching and the rate cap are part of the
  feature rather than hardening added later.
- (−) Zone rules change with a config deploy, and a mistyped range silently
  reclassifies an area — boot validation checks the shape of a rule, never its
  intent.
- (−) An address the provider does not know is typed by hand and falls into the
  catch-all zone, which is the correct answer but a worse experience.
- (⚠) The threshold is never a gate: nothing in the flow may refuse or block an
  order because it is under a free-delivery minimum.
- (⚠) Postal codes are compared as fixed-width strings, never parsed as numbers.
- (⚠) The server re-derives the zone at submission from the submitted address and
  never trusts a zone the browser reports, exactly as it re-prices the cart.
