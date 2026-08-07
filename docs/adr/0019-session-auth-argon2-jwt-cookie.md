# 0019 — Session auth: argon2id + JWT-in-httpOnly-cookie, DB as authorization source

**Status:** accepted · **Date:** 2026-07-25 · **Amended:** 2026-08-07 (what
carrying the model to real accounts changed, v1.2.0)

## Context

The admin panel must be gated before real content entry (FR-AUTH-07), ahead of
full account management (FR-AUTH-01…06, iteration 4). The stack choice is already
fixed (app-issued JWT + Nest guards, not OAuth2/OPA — see the project brief);
this ADR records the concrete model: how passwords are stored (NFR-SEC-03), how
authorization is enforced server-side (NFR-SEC-04), and how the first admin comes
to exist. Open questions were: pure-stateless JWT vs. checking the database;
bcrypt vs. argon2; and how a seeded admin is created without clobbering data on
redeploy.

## Decision

- **Passwords:** argon2id (`@node-rs/argon2`, prebuilt multi-arch binaries),
  OWASP-baseline cost, params pinned in one shared module.
- **Session:** a signed JWT in an **httpOnly + secure + sameSite=lax** cookie
  (7-day expiry). No token in client JavaScript.
- **JWT = identity, DB = authorization.** The guard verifies the signature, then
  loads the user and uses the **database** `role`; a per-user `tokenVersion`
  embedded in the token is bumped on password change to revoke prior sessions.
- **Guards are opt-in** per route via an `@Auth(...roles)` composite (mirroring
  the throttle presets, 0015), so public catalog/pages stay open; login is
  rate-limited (NFR-SEC-02).
- **First admin:** a `bootstrap-admin` one-shot container (sibling to migrate,
  0012), **create-if-missing**, run in every environment. Credentials come from
  env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), separate from the dev-only content seed.

## Rationale

1. **argon2id over bcrypt** — memory-hard, current best practice; the prebuilt
   `@node-rs` binaries avoid node-gyp on the arm64/amd64 image builds (0007).
2. **DB as authz source** — a signed token is tamper-proof but _stale_: a demoted
   or deleted user would keep access until expiry. One indexed lookup per gated
   request (admin routes only, low traffic) buys immediate revocation and makes
   password-change logout trivial via `tokenVersion`. We can afford freshness
   because we don't need JWT's statelessness for scale.
3. **httpOnly cookie** keeps the token out of reach of XSS; `sameSite=lax` blocks
   CSRF on the mutating POSTs while still riding top-level navigations for SSR.
4. **Bootstrap split** — content seed overwrites on every dev deploy; an admin
   account must **never** be clobbered, and must exist on prod (which is never
   content-seeded). Create-if-missing in a dedicated one-shot satisfies both.
5. **Plaintext `ADMIN_PASSWORD`** (hashed by the one-shot) over a pre-hashed
   value: simpler, and it is a first-boot secret the admin rotates in-app
   immediately; the plaintext lives only in the short-lived one-shot's env.

Concessions: the per-request DB read trades a little latency for freshness — the
wrong call at high QPS, the right one here. A pre-hashed `ADMIN_PASSWORD_HASH`
(plaintext never in any env) is the documented hardening for real-prod if wanted.

## Consequences

- (+) NFR-SEC-03/04 met; revocation (demote/delete/password-change) is immediate.
- (+) One shared hashing module and one `@Auth()` decorator for all admin routes.
- (+) Prod gets an admin with no manual step and no risk to existing data.
- (−) Guarded routes do a DB lookup per request (fine for one low-traffic API
  container; revisit with a cache/replicas).
- (−) The bootstrap plaintext sits in the deploy env file until the admin
  rotates it; `ADMIN_PASSWORD_HASH` is the escape hatch if that is unacceptable.
- (−) Deploy pipelines must now supply `JWT_SECRET` + `ADMIN_*` as secrets.

## Amendment — 2026-08-07 (v1.2.0): the model under real accounts

The decision above was taken for one seeded admin (FR-AUTH-07). Iteration 4 put
customers, managers and a full account lifecycle on it (0032, 0034) without
changing any of it — worth recording, because "it held" is the useful finding.
Four things it grew:

- **A second gate beside the role.** The guards check `users.status`, not only
  the role: only `active` authenticates. A session already in flight stops
  working the moment an account is deactivated or anonymized — the same
  freshness argument as rationale 2, which is what made the check a one-liner.
- **`tokenVersion` is bumped by more than a password change** — deactivation
  retires the password and the sessions with it. The claim in Consequences
  ("revocation is immediate") now covers every way an account can end.
- **`OptionalAuthGuard`** reads a session where one exists and falls through to
  guest otherwise, for the catalog's tier pricing (0031). It is the same lookup;
  what is new is that an _unauthenticated_ request is a valid outcome rather
  than a 401, so the per-request read now happens on public routes too for
  signed-in visitors. Measured ~0.09 ms; deliberately not cached (see 0031).
- **Authorization is no longer only "which role"** — a manager may act on
  customers but not on staff, enforced against the _stored_ target row rather
  than the request, and role changes are refused in the handler rather than
  stripped. `@Auth(...)` still carries the coarse gate; the fine one cannot live
  in a decorator because it depends on the row being acted upon.

The bootstrap admin is unchanged and still create-if-missing. What did change
around it: an account provisioned by config is now the _only_ kind prompted to
replace a password it did not choose (FR-AUTH-08) — approved customers pick
theirs through a single-use link and never receive one (0034).
