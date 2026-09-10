# 0053 — Authenticate automated clients with scoped, hashed machine tokens

**Status:** accepted · **Date:** 2026-09-10

## Context

ADR 0026 specified a headless entry point for the bulk sync and deferred it for
one reason: the session credential is browser-shaped. It is a `httpOnly` cookie
carrying a JWT that rotates with `tokenVersion` (ADR 0019), issued to a person,
expiring on a human timescale, and revoked by a password change. An adapter
calling every fifteen minutes for years has none of those properties.
NFR-SEC-09 states what is needed instead: tokens stored hashed, scoped to what
they may do, revocable from the admin panel, rate-limited independently of the
interactive endpoints.

Alternatives considered: giving the adapter a service _account_ and letting it
log in; a long-lived JWT with a machine audience; mutual TLS; an HMAC signature
over each request body.

## Decision

- **A token is a row, not an account.** `api_tokens` carries a name, a scope, a
  hash, a created-at, a last-used-at and an optional revoked-at. It has no
  password, no email, no tier, no role, and cannot sign in.
- **Stored as a hash, shown once.** The value is generated server-side with a
  short unhashed prefix kept in clear for identification; the full value is
  returned by the creating call and never again.
- **Scoped, and the scope is a small closed set** naming what a token may do,
  not which endpoints it may reach. `catalog-sync` is the only scope this
  iteration issues.
- **Presented as a bearer token**, never as a cookie, and never in a URL
  (NFR-SEC-10).
- **Its own guard and its own rate limit.** A machine request is authenticated
  by the token guard alone — it never falls back to the session cookie, and a
  session cookie never satisfies a machine endpoint. The limit is set for a
  scheduled caller and is independent of the interactive buckets (ADR 0015).
- **Revocation is immediate and local**: a revoked row is refused on the next
  request, with no version counter to propagate.
- **Every run records the token that made it** (FR-ADM-09), and using a token
  updates its last-used-at, which is what makes an abandoned token visible.

## Rationale

**A token is not a person, and modelling it as one is where this usually goes
wrong.** A service account would have inherited a role, a password reset path,
an approval state and a place in the user list — five things that are wrong for
a caller with no inbox — and it would have put a permanent credential inside
the mechanism that exists to expire credentials. Keeping tokens in their own
table means the account rules (ADR 0032) never have to grow an exception, and
the role/tier invariant is untouched.

**Scoping by capability rather than by route** keeps the check where the rule
is: a handler asks for the scope it needs, and adding an endpoint to an existing
capability does not mean editing a list of paths in a token row. It also keeps
the admin screen honest — "this token may submit catalog imports" is a sentence
an operator can act on.

**Hashing is not optional even for a credential the operator generated.** The
tokens table is in every database backup and every restore, and the value is
long-lived by design.

**Mutual TLS and request signing were both rejected as too much machinery for
the threat.** The adapter is a container the operator deploys, reached over
TLS; the marginal attack a signature defeats — a leaked token replayed — is
answered adequately by revocation, and both alternatives would have made
rotation a deployment event rather than a click.

## Consequences

- (+) The headless path ADR 0026 deferred is unblocked without changing the
  session model, and a deployment with no adapter still gains a way to automate
  its own imports.
- (+) A compromised token is revoked in one click and affects nothing else; the
  interactive rate limits cannot be exhausted by a misbehaving integration, and
  vice versa.
- (+) `api_tokens.lastUsedAt` answers "is this still in use" before anyone has
  to guess at it.
- (−) A second authentication path exists, so every machine-reachable endpoint
  must state which one it accepts. The guard is written once and fails closed;
  the discipline is that a machine endpoint is never merely an admin endpoint
  with an extra way in.
- (−) The token value is unrecoverable. A lost one is replaced, not looked up.
- (−) Scopes are a closed set in code, so a new capability is a release. That is
  the intended trade: a scope is a security boundary, not deployment data.
