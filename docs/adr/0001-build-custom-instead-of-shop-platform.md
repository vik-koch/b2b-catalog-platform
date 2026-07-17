# 0001 — Build a custom application instead of adopting a shop platform

**Status:** accepted · **Date:** 2026-07-17

## Context

The platform serves a small B2B retail/wholesale business: a few hundred
SKUs, manual account approval, negotiated per-customer-tier pricing that
must stay invisible to the customer, and file-based catalog sync from a
legacy system with diff preview and audit logging. The project is also,
by design, a public portfolio piece that must demonstrate real software
engineering — requirements, architecture, phased delivery — not product
configuration.

Alternatives considered: WordPress/WooCommerce with B2B plugins (e.g.
B2BKing), Shopware 6, and headless commerce platforms (e.g. Medusa) as
the middle ground between platform and custom build.

## Decision

Build a custom application: Angular + NestJS + PostgreSQL, TypeScript
end-to-end.

## Rationale

1. **The portfolio purpose is a hard requirement no platform can meet.**
   Configuring a shop demonstrates configuration; this project must
   demonstrate engineering.
2. **The B2B core is exactly where platforms are weakest.** Approval
   workflows, invisible tier pricing, and the audited file-sync would mean
   a stack of paid plugins (WooCommerce), paid editions (Shopware B2B),
   or custom code anyway — while the surrounding storefront is the easy,
   well-understood part.
3. **Right-sized operations.** One VM, one compose stack, no plugin/update
   treadmill, no license fees, minimal attack surface.

Honest concessions: for a pure "client needs a shop at minimal cost"
scenario without the portfolio goal, WooCommerce + a B2B plugin would be
the sane default. A headless commerce platform would reduce the backend
surface, but the storefront and all approval/sync admin flows would still
be custom — we would inherit marketplace/multi-currency machinery this
project does not need and keep most of the custom work regardless.

## Consequences

- (+) Full control over the pricing and sync domain model; exact fit, no
  workarounds around plugin assumptions.
- (+) Every layer is demonstrable engineering work — the portfolio value.
- (−) All shop basics (catalog, cart, orders, accounts) must be built and
  maintained here; no plugin ecosystem to lean on.
- (−) Higher upfront development cost than configuration — accepted
  because the development itself doubles as the portfolio.
