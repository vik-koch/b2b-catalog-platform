# 0043 — Move contracts to oRPC, and send the browser routes rather than schemas

**Status:** accepted · **Date:** 2026-09-03

Contract-first was a project-brief decision rather than an ADR, so this is the
first record of it: the approach stands, the library implementing it changes.

## Context

The contract layer had to move because it had stopped moving. `@ts-rest/nest`
peers `zod ^3.22.3` and `@nestjs/core ^9 || ^10 || ^11`, so a single dependency
was holding back both Zod 4 and NestJS 12; its last release was 2025-03-04, and
the release candidate that drops the Zod peer still caps Nest at 11 and was
never promoted. Nothing about the contract-first design was in question — one
schema per endpoint in `libs/shared`, implemented by the API and called by the
web app, is what NFR-SEC-05 is enforced by and what keeps the two apps honest
about shapes.

The replacement is **oRPC 1.15**: contract-first, `@nestjs/core >=11`,
`express >=5`, and a Standard Schema consumer, so it validates with the Zod
schemas already written.

That migration is also what made a second question answerable. The web app's
initial bundle had grown to 819.40 kB (208.16 kB transferred), and **117.8 kB
of it was Zod** — the fourth-largest thing in the app after Angular's core, the
app itself and the router. The client was being handed the real contract, which
is the object every schema hangs off.

The size budget is what noticed, and is worth naming for what it is: a tripwire
that has been raised twice as the app grew (600 kB, then 800 kB) and will be
raised again. It says "bigger than the last time somebody looked", never "a rule
broke", so it can start a conversation but cannot be the guard for one.

Alternatives considered: staying on ts-rest with pinned peers and a fork;
hand-writing controllers and a typed client with no contract library; moving
to oRPC's RPC link (which needs no contract in the browser at all, but gives up
REST-shaped URLs — and with them the cache keys, the crawler-visible paths and
the OpenAPI description).

## Decision

**oRPC replaces ts-rest**, contract for contract. `@Implement`/`implement` on
the API side, `safe()` with typed errors on the web side, and the OpenAPI link
so the wire stays the REST shape it was.

**The browser is given routes, not schemas.** `tools/generate-contract-routes.mjs`
emits `contract-routes.generated.ts` from the real contracts —
method, path and input/output structure per procedure, which is everything the
client link reads — typed as the contract it came from, so call sites keep their
types. CI checks the file is current.

**A schema module exports schemas.** Plain constants, pure helpers and the
patterns both sides check against live in modules that import nothing:
`auth-constants.ts`, `cart-constants.ts`, `catalog-constants.ts`,
`page-constants.ts`, `email-format.ts`, and the helper half of
`contact-format.ts`. Schemas are built _from_ them.

**A coded refusal travels as an oRPC error**, raised by the `refusals`
middleware for anything a service throws and by a global `ContractErrorFilter`
for anything a guard throws, so the browser always receives
`{ defined, code, status, message, data }` and renders wording from the code
(never from the message).

## Rationale

**Contract-first survives the library change**, which is the whole reason the
migration was affordable: 16 contracts, 78 endpoints and 18 controllers moved
without a single change to what the API accepts or answers, and the e2e suite
that asserts the wire shapes is what proved it.

**Route metadata is all the client needs, so it is all it gets.** The link codec
reads `route.method`, `route.path`, `route.inputStructure` and
`route.outputStructure`; validation is the server's job (NFR-SEC-05), and
nothing in the browser ever calls `.parse()` on a contract schema. Generating
that subset is cheap and cannot drift — it is derived from the contracts by
oRPC's own `minifyContractRouter`, and CI fails on a stale file. Hand-writing a
second copy of the routes would have been the drift risk this avoids.

**Constants had to leave the schema modules**, which is the part that is not
obvious: a bundler cannot tree-shake a module down to its plain exports when the
rest of it is `z.string()` calls, because a call has to be assumed to matter. One
component importing `CART_NOTE_MAX` was therefore enough to pull the entire
validation runtime into the first load. Splitting by what a module _is_ — data
and pure functions, or schemas — makes that structural instead of accidental.

**The email rule is now a pattern rather than `z.email()`.** The form and the
API must agree on what a valid address is, and they used to agree by sharing the
schema — which meant shipping Zod to check a regex. `EMAIL_PATTERN` is shared
instead and both sides apply it; it keeps the property the shared schema was
there for (Angular's `Validators.email` accepts `a@b`, and this does not) at
none of the weight.

**Storefront routes stay eagerly loaded.** Making the inquiry page lazy removed
another 13 kB, and was reverted: its form is server-rendered and typable before
its chunk arrives, so text entered in the first moments was discarded at
hydration. The e2e suite caught it. Admin affordances _inside_ storefront pages
are a different case and are deferred — nobody types into a delete dialog that
has not loaded.

## Consequences

- (+) Zod 4 and NestJS 12 became possible; both shipped in the same release.
- (+) The initial bundle is **701.26 kB raw / 179.29 kB transferred**, from
  819.40 / 208.16 — and below the 763.79 kB it was before any of this work
  (measured 2026-09-03; these are a record of the change, not a target to
  defend). Zod is entirely absent from it, and loads with the pages that
  validate.
- (+) A refusal has one shape on the wire, and one place that decides it.
- (−) A generated file in the repository, and a CI step to keep it honest.
  Changing a route now means running the generator; changing a _schema_ does
  not, which is the common case.
- (−) `libs/shared` has more modules for the same content, and a new
  rule to know: a constant does not live in a `*.contract.ts`.
- (−) Email validity is our regex now, not Zod's. It is stricter than
  `Validators.email` and looser than a full RFC 5322 parse, which is the same
  place `z.email()` sat.
- (⚠) The split is a convention the type system cannot check: a constant added
  back to a contract module and imported by an eager component puts Zod in the
  first load again, compiling cleanly. `tools/check-initial-bundle.mjs` is the
  guard — it walks the statically reachable chunks and fails CI when a
  validation runtime is among them, which is the rule this decision made rather
  than a number that moves with the app.
