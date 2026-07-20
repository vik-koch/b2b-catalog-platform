# 0010 — Embed maps as iframe URLs only, behind a per-deployment provider seam

**Status:** accepted · **Date:** 2026-07-20

## Context

FR-NAV-04 requires the contact page to show an embedded map of the company
office(s). NFR-LEGAL-03 requires a cookie-consent mechanism that gates
non-essential cookies **where the deployment's jurisdiction requires it**. Two
forces complicate "just embed a map":

- **Providers vary by deployment** — a region-specific integration. The demo
  uses OpenStreetMap; a client may mandate a regional provider; others may want
  Google Maps. This is exactly the ports-and-adapters seam the project reserves
  for region-specific integrations (public interface, private concrete adapter).
- **Providers offer different embed mechanisms.** Some expose an iframe URL;
  others (notably some regional providers) only offer a JavaScript widget that
  loads an external script and runs in the host page. A raw third-party
  `<script>` runs in the app's own context with full DOM/cookie/storage access,
  breaks SSR (a client-only DOM mutation fighting hydration), and widens the
  app's Content-Security-Policy.

The map is also cookie-relevant: interactive third-party maps set cookies / load
tracking (→ consent, NFR-LEGAL-03), while OpenStreetMap and static tiles set
none. The map config is a deployment-config value delivered through the SSR
TransferState seam (0009), as anticipated by 0008.

Alternatives considered: (a) load each provider's JS widget directly in-page;
(b) a static map image only; (c) iframe-URL-only, with script providers wrapped
behind a private endpoint.

## Decision

- A map embed is **only ever an iframe pointing at a URL** —
  `MapEmbed = { url; consentRequired? }` in deployment config. All map rendering
  goes through a single `MapFrame` component: the one place an iframe is created.
- **No third-party map script runs in the app's own page.** A script-based
  provider is wrapped behind a per-deployment endpoint (ideally its own origin)
  that `url` points at; from the app's side it is indistinguishable from any
  other iframe. The concrete wrapper and any API key live in the **private
  deployment**, not the public repo.
- **Consent is per-embed.** `consentRequired` marks cookie-setting embeds;
  `MapFrame` renders them only when `ConsentService.canUse()` is true (consent
  not enforced, or accepted) and otherwise shows a placeholder. No-cookie embeds
  render immediately.

## Rationale

1. **iframe isolation is the safe default.** A cross-origin iframe runs in its
   own browsing context with its own CSP and cookie jar, renders as static HTML
   (SSR-clean), and makes `bypassSecurityTrustResourceUrl` an honest
   resource-URL trust rather than script execution.
2. **The wrapper keeps the adapter private and the app provider-agnostic.**
   Script-only providers sit behind a private endpoint, so the public image
   never learns a provider's domains, script, or key — matching
   ports-and-adapters and build-once-promote (0007): no per-provider rebuild.
3. **Consent is right-sized.** A single binary consent (no categories) plus
   `consentRequired` per embed and `canUse()` covers both an enforcing
   jurisdiction (gated) and a no-rules one (flag off → loads freely) from one
   flag — satisfying NFR-LEGAL-03's "where required by jurisdiction."
4. **The trust bypass is justified by the source.** `url` is deployment-owned
   config, not user or DB input, so vouching for it is safe.

Concessions: an iframe loses some of a provider's native richness (e.g. a linked
company card) versus its JS widget — acceptable for "here's where we are", and a
wrapped widget behind the private endpoint can restore it if needed. The wrapper
is a small piece of private infrastructure for script-only providers. And the
bypass holds **only** while map data comes from deployment config; if locations
ever become admin-editable (DB-sourced), the trusted bypass must be replaced by
a map-provider domain allowlist.

## Consequences

- (+) One public image serves any provider; provider choice is a per-deployment
  config value, decided privately.
- (+) No third-party script in the app's page: SSR integrity preserved, the
  app's CSP stays free of provider domains, XSS surface minimized.
- (+) Consent is one enforceable chokepoint (`MapFrame`); the `canUse()` states
  and the placeholder branch are unit-tested.
- (+) Multi-location is a config list — several offices need no code change
  (FR-NAV-04).
- (−) Script-only providers require a private wrapper endpoint (extra infra) and
  lose native widget richness unless wrapped.
- (−) Hardening is left as options, none yet an explicit NFR-SEC item: iframe
  `sandbox` (omitted for now to avoid breaking provider maps), CSP `frame-src`,
  and domain-restricting any client-exposed map API key.
- (−) A future admin-editable (DB-sourced) locations model would need domain
  allowlisting to replace the trusted-URL bypass.
