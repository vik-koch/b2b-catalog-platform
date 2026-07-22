# 0015 — Rate-limit abuse-prone endpoints with @nestjs/throttler and a honeypot

**Status:** accepted · **Date:** 2026-07-22

## Context

Several public/unauthenticated endpoints are abuse-prone and already carry
requirements: auth (NFR-SEC-02, brute force), guest checkout (NFR-SEC-06, spam
orders), and now the contact form (FR-NAV-06). They need spam/brute-force
mitigation that does not harm legitimate users, and the mechanism should be
**reused** across all of them rather than reinvented per endpoint.

Traefik already rate-limits auth at the edge (0005), but that is per-proxy and
absent in dev/e2e. CAPTCHAs carry cost: reCAPTCHA sets cookies (→ consent, 0011)
and ships data to Google, and a contact form must work for everyone regardless
of consent.

Alternatives considered: (a) edge-only (Traefik) limiting; (b) app-level
`@nestjs/throttler` + honeypot; (c) a CAPTCHA up front.

## Decision

- App-level rate limiting via **`@nestjs/throttler`**, applied per-route
  (`@Throttle`) through a small **shared guard**, reused by contact, checkout,
  and auth.
- A **honeypot** hidden field on public forms — reject when non-empty.
- The app **trusts the proxy's forwarded client IP**, so throttling keys on the
  real client behind Traefik and complements (does not replace) the edge limit.
- **No CAPTCHA now.** Cloudflare **Turnstile** (privacy-friendly, ~cookieless,
  configurable on/off) is the reserved upgrade if honeypot + throttle prove
  insufficient; **reCAPTCHA is rejected** (cookies/consent + Google).

## Rationale

1. **`@nestjs/throttler` is the idiomatic, dependency-light mechanism;** one
   shared guard satisfies NFR-SEC-02/06 and the contact form with a single tool.
2. **Honeypot is free and consent-free** — important because gating a contact
   form behind a CAPTCHA/consent would break it for privacy-conscious or
   pre-consent users.
3. **Defense in depth:** Traefik at the edge + throttler per-route + honeypot,
   each cheap.
4. **Deferring CAPTCHA** avoids a third-party widget, cookies, and UX friction
   before there is evidence of real spam; Turnstile (not reCAPTCHA) is the
   escape hatch precisely because it avoids the consent problem.

Concessions: in-memory throttler state is per-instance — fine for one API
container, but a multi-instance deployment needs a shared store (e.g. Redis)
for accurate limits (deferred with replicas). Honeypot + IP throttling will not
stop a determined or distributed attacker — that is when Turnstile earns its
place.

## Consequences

- (+) One reusable guard for every abuse-prone endpoint; NFR-SEC-02/06 and the
  contact form covered by the same code.
- (+) No cookies, no third party, no consent coupling in the default path.
- (+) Works in dev/e2e without Traefik.
- (−) In-memory limits are per-instance until a shared store is added (needed
  once the API scales beyond one container).
- (−) Not sufficient against distributed abuse — Turnstile is the deferred
  upgrade.
- (−) A new requirement is warranted (public/contact endpoints rate-limited),
  as a sibling to NFR-SEC-06.
