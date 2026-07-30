# 0023 — Maintenance mode is a DB-persisted flag enforced as a server-side 503 gate

**Status:** accepted · **Date:** 2026-07-28

## Context

FR-ADM-04 needs a site-wide maintenance mode the admin can flip from the panel.
Its first and defining use is the **go-live gate**: prod ships with the storefront
hidden while the client populates catalog and content (FR-ADM-01/02/03), and
turning it off is the launch. It recurs afterward as an ordinary maintenance
window (e.g. during a bulk sync).

Three forces shape the decision:

1. **It must toggle at runtime without a redeploy, by a non-technical admin.**
   A build-time or `config/`-directory flag (0018) is per-deployment boot config,
   loaded whole at start — changing it means editing files and restarting the
   container. NFR-OPS-01 forbids manual commands against prod, so "SSH in and edit
   a file" is not an available toggle. The state is therefore mutable application
   data, which is the database.
2. **Hiding must be real, not cosmetic.** The point is that visitors _and crawlers_
   receive nothing indexable before launch. A front-end route guard alone leaves
   the read APIs and SSR HTML fully serving content. Enforcement has to sit on the
   backend and the SSR layer.
3. **The status code carries SEO weight.** A pre-launch storefront returned as
   `200 OK` with a "coming soon" body invites crawlers to index the placeholder as
   the real page — the exact opposite of the intent, and a mess to unwind right at
   launch. Temporary unavailability has a correct HTTP semantics: **503**.

Alternatives considered: a `config/` boot flag (rejected — not runtime-mutable,
violates the no-manual-prod-commands constraint); a Traefik-level block (rejected —
can't be driven from the admin panel, and can't distinguish authenticated admin
traffic cleanly); a 200 placeholder page (rejected — indexing hazard).

## Decision

Maintenance mode is a **single boolean row in the database** (a one-row
`app_settings` table, the first of a small runtime-settings surface), toggled
through an **admin-only** endpoint from the panel.

Enforcement is **server-side, fail-safe, and mirrored in SSR**:

- A **global NestJS guard** reads the flag and returns **`503` with `Retry-After`**.
  It passes a request through on **either** of two grounds:
  - **Route-structural:** the route is inherently privileged — already behind admin
    authentication (RolesGuard), an auth route (login, password change), or a
    health/readiness probe. These stay open regardless of who calls, so the admin
    panel and orchestration keep working.
  - **Identity-based:** the request carries a **valid admin session**. An
    authenticated admin bypasses the gate on _every_ route, public ones included,
    so they preview the real storefront exactly as it will appear at launch.

  A request that is neither privileged-by-route nor admin-authenticated — i.e. an
  anonymous visitor or a crawler hitting catalog/product/static-page/sitemap — is
  gated. Fail-safe: a route nobody exempted stays hidden.

- The **SSR server** mirrors the same two-part check for browser-visible routes:
  an anonymous request gets `503` and a minimal, self-contained **maintenance
  notice** (no catalog data fetched), while a request bearing the admin session
  cookie renders the live storefront. `/login` and the admin app stay reachable to
  everyone.
- **`robots.txt`** switches to disallow-all and **`sitemap.xml` returns 503** while
  maintenance is on, so nothing leaks into a crawler's queue. This is why FR-ADM-04
  is built before the sitemap (NFR-SEO-02): the suppression is part of the sitemap's
  first implementation, not a retrofit.
- Toggling the flag **busts the per-slug SSR static-page cache** (same invalidation
  hook admin content saves use, 0018-era), so stale cached pages can't survive the
  transition in either direction.

## Rationale

1. **Runtime-mutable admin state belongs in the DB, not `config/`.** The config
   directory is loaded-whole-at-boot per-deployment identity (0018); a flag the
   admin flips between requests is data. Putting it in the DB is the only option
   that honors NFR-OPS-01 (no manual prod commands) while giving the admin a
   button.
2. **503, not 200.** It is the one status that tells a crawler "temporarily gone,
   come back" instead of "index this." Getting it right pre-launch avoids an
   indexed-placeholder cleanup at the worst possible moment.
3. **Structural + identity exemption beats an allowlist.** Keying route-level
   pass-through off "already requires admin auth" means new admin endpoints are
   exempt automatically and new public endpoints are gated automatically — the
   guard can't drift out of sync with the route surface, and the failure direction
   is safe (hidden, not leaked). Layering an admin-session bypass on top gives the
   admin a full live preview of the public storefront without punching a
   route-specific hole for it.
4. **Backend + SSR enforcement, not a route guard.** RBAC and NFR-SEC-04 already
   establish that access control lives server-side; maintenance mode is the same
   principle for a different axis, so a UI-only guard would be inconsistent and
   trivially bypassed by hitting the API directly.

A single boolean is deliberately minimal. If a settings surface grows later
(banners, feature flags), the one-row table generalizes, but nothing here commits
us to that.

## Consequences

- (+) The client gets a real, safe pre-launch workflow: deploy with the gate on,
  fill the catalog behind it, flip it off to launch — no redeploy, no crawler
  contamination, no manual prod access.
- (+) The 503/robots/sitemap behavior is designed once, alongside the sitemap it
  gates, instead of being bolted on.
- (+) Reusable afterward as an ordinary maintenance window.
- (−) A new global guard sits in every request path; it must be cheap (the flag is
  read-mostly and should be cached in-process with invalidation on toggle, not a
  DB hit per request).
- (−) Two enforcement points (API guard + SSR check) must agree on the exemption
  rule; they share the same flag but are separate code and need a test each.
- (−) The admin-preview path complicates SSR caching: the per-slug cache must key
  on (or bypass for) maintenance state and admin identity, so an admin's live
  preview is never cached and served to an anonymous visitor, and the anonymous
  503 is never cached as a slug's body.
- (−) Introduces the first runtime-settings table — a small new persistence
  concern distinct from the `config/` mechanism, and the boundary between the two
  ("boot identity vs. runtime state") must stay clear to avoid future confusion.
