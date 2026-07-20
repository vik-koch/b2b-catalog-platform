# b2b-catalog-platform

A B2B catalog and ordering platform for small wholesale/retail businesses: browsable product
catalog, tiered customer pricing, order-request checkout with manager review, and admin-driven
catalog management with file-based bulk sync.

> **Status:** early stage — requirements and roadmap are defined & implementation started.
> 
> Demo dev environment is available via: https://b2b-dev.vikkoch.com.

## What this project is

This repo serves two purposes:

1. **A real product** — deployed for an actual client (a small wholesale business with a
   several-hundred-SKU catalog and negotiated per-customer pricing). Client specifics live in a
   private deployment repo; this public repo uses a fictional demo shop persona.
2. **A portfolio piece** — demonstrating requirements engineering, documented architecture
   decisions (ADRs), disciplined AI-assisted development, and phased backward-compatible delivery.

## Key features (planned)

- **Catalog** — category tree, paginated product grids, rich product pages, tokenized/ranked
  search (Postgres FTS)
- **Tiered pricing** — customer tiers map to price lists; guests see the default price list
- **Accounts & roles** — admin / manager / user, registration with manager approval
- **Ordering** — cart, order-request checkout with manager review, bank transfer or card payment
- **Admin panel** — product CRUD plus file-based bulk sync (upsert by SKU, diff preview,
  audit-logged)
- **Compliance** — configurable legal pages, cookie consent

## Documentation

- [`docs/requirements.md`](docs/requirements.md) — requirements to the project
- [`docs/roadmap.md`](docs/roadmap.md) — iteration plan mapping requirements to delivery order

## Workflow

Trunk-based development on `main` with short-lived `feat/*` / `fix/*` branches and strict semver.
Issues carry requirement IDs; iterations are tracked as GitHub Milestones and releases as GitHub Releases per tag.
