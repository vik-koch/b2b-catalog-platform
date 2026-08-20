# b2b-catalog-platform

A B2B catalog and ordering platform for small wholesale/retail businesses: browsable product
catalog, tiered customer pricing, order-request checkout with manager review, and admin-driven
catalog management with file-based bulk sync.

> **Status:** `v1.4.0` — a category or a search result can be narrowed by the attributes its
> products carry, from a registry the admin declares. Iterations 1–6 are delivered (static
> pages and infrastructure, catalog + admin panel, search, accounts and tiered pricing, units
> of sale, attribute filtering). Iteration 7 (cart and order-request checkout) is next.

## Environments

Two stacks share one VM; the shared Traefik proxy routes each by hostname, and one shared
Grafana collects both their logs. See [`infra/README.md`](infra/README.md) for how they deploy.

| Env      | URL                         | Reviewer inbox¹                   | Status                                        |
| -------- | --------------------------- | --------------------------------- | --------------------------------------------- |
| **dev**  | https://b2b-dev.vikkoch.com | https://b2b-dev.vikkoch.com/inbox | live · redeploys on every merge to `main`     |
| **prod** | https://b2b.vikkoch.com     | https://b2b.vikkoch.com/inbox     | from `v0.1.0` · redeploys on each release tag |

¹ Each environment runs its own [Mailpit](https://mailpit.axllent.org/) sink — no real mail
leaves the demo; inquiries land in that environment's inbox. The reviewer inbox and Grafana
are credential-gated (they're the demo's plumbing, not public features).

## What this project is

This repo serves two purposes:

1. **A real product** — deployed for an actual client (a small wholesale business with a
   several-hundred-SKU catalog and negotiated per-customer pricing). Client specifics live in a
   private deployment repo; this public repo uses a fictional demo shop persona.
2. **A portfolio piece** — demonstrating requirements engineering, documented architecture
   decisions (ADRs), disciplined AI-assisted development, and phased backward-compatible delivery.

## Key features

Shipped:

- **Catalog** — category tree, paginated product grids, rich product pages, tokenized/ranked
  search with typo tolerance (Postgres FTS + trigram)
- **Tiered pricing** — customer tiers map to price lists; guests and untiered accounts see the
  default one
- **Accounts & roles** — admin / manager / user; registration with staff approval, invitation
  and reset links, self-service profile, and account deletion that anonymizes rather than erases
- **Admin panel** — product and category CRUD, static-page editing, customer and staff
  administration, maintenance mode, plus file-based bulk sync (upsert by SKU, diff preview,
  audit-logged)
- **Units of sale** — buy by piece, pack or box, with exact per-unit prices, minimum order
  quantities, and a publication gate so a newly synced product is reviewed before it goes public
- **Attribute filtering** — an admin declares which product attributes are filterable; category
  listings and search results offer them as counted facets, shareable in the URL, with an
  inventory that renames a key or a value across the whole catalog
- **Compliance** — configurable legal pages, cookie consent, third-party licence attribution

Planned:

- **Ordering** — cart, order-request checkout with manager review
- **Payment** — bank transfer or card, with manual delivery/pickup coordination

## Documentation

- [`docs/requirements.md`](docs/requirements.md) — requirements to the project
- [`docs/roadmap.md`](docs/roadmap.md) — iteration plan mapping requirements to delivery order
- [`docs/adr/`](docs/adr) — architecture decision records, one per decision, in the order they
  were taken; each states the alternatives weighed and what the choice costs

## Workflow

Trunk-based development on `main` with short-lived `feat/*` / `fix/*` branches and strict semver.
Issues carry requirement IDs; iterations are tracked as GitHub Milestones and releases as GitHub Releases per tag.
