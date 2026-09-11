# b2b-catalog-platform

A B2B catalog and ordering platform for small wholesale/retail businesses: browsable product
catalog, tiered customer pricing, order-request checkout with manager review, and admin-driven
catalog management with file-based bulk sync.

> **Status:** `v1.9.0` — what the shop does with an order after it arrives: a manager answers
> it, changes it by agreement, records the money against it and hands over the papers, and
> every one of those moves writes a version the customer's own page and their mail can be
> pointed at. Iterations 1–11 are delivered (static pages and infrastructure, catalog + admin
> panel, search, accounts and tiered pricing, units of sale, attribute filtering, cart and
> checkout, stock availability and work-awaiting indicators, sold-together sets, product
> documents, order processing). Iteration 12 (two-way sync with the source system) is next.

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

- **Catalog** — category tree, paginated product listings as cards or rows, rich product pages,
  tokenized/ranked search with typo tolerance (Postgres FTS + trigram)
- **Tiered pricing** — customer tiers map to price lists; guests and untiered accounts see the
  default one
- **Accounts & roles** — admin / manager / user; registration with staff approval, invitation
  and reset links, self-service profile, and account deletion that anonymizes rather than erases
- **Admin panel** — product and category CRUD, static-page editing, customer and staff
  administration, order views, maintenance mode, plus file-based bulk sync (upsert by
  catalogue ID, diff preview, audit-logged)
- **Units of sale** — buy by piece, pack or box, with exact per-unit prices, minimum order
  quantities, and a publication gate so a newly synced product is reviewed before it goes public
- **Attribute filtering** — an admin declares which product attributes are filterable and each
  category which of them its listing offers; category listings and search results offer them as
  counted facets, shareable in the URL, with an inventory that renames a key or a value across
  the whole catalog
- **Ordering** — a browser-held cart that persists between visits and reports what changed while
  it waited, a one-form checkout submitting an order request for manager review, guest or
  signed-in, with a saved address book, the invoiced party, delivery zones or pickup points,
  and confirmation mail to customer and staff
- **Stock availability** — an optional piece count from the sync or the admin form, shown to
  customers only as in stock / few left / out of stock, ordering what is gone to the end of
  every listing and refused by the cart and by checkout
- **Work awaiting attention** — a marker on the account control whenever a queue has something
  in it, and a line beside the section that resolves it; counted from current state, never
  acknowledged away
- **Sold-together sets** — an admin pairs a product with what it is sold with, mutually and
  from either side; the pairing is marked wherever the product can be bought and opens its
  counterparts to be added without leaving the page, and the cart says which lines are short
  and by how much — advisory, or refused at checkout where a deployment says so
- **Product documents** — certificates, declarations and data sheets uploaded once and shown
  on any number of products, linked from either side; a document is stored exactly as it was
  uploaded, leaves the storefront the day its expiry passes, and is counted as work for the
  admin from thirty days before that
- **Order processing** — a manager answers an order, moves it forward or a step back, and
  changes it by agreement — lines, prices, the price list it is read from, where it goes, who
  it is invoiced to; every move and every change writes a version, so the order is its own
  history and any version reads back whole while the reference and the link stay put. Payment
  is a fact of its own beside the state, so cash on delivery is not an exception, and an order
  handed over that nobody has recorded as paid is counted as work
- **Order documents** — payment instructions and an order summary, generated by the platform
  or replaced by a file the operator supplies, readable by whoever may read the order and
  attached to the mail that says the order was accepted
- **Compliance** — configurable legal pages, cookie consent, third-party licence attribution

Planned:

- **Two-way sync** — machine clients exchanging catalog and orders with the source system
- **Card payment** — online card payment offered after an order is accepted

## Documentation

- [`docs/requirements.md`](docs/requirements.md) — requirements to the project
- [`docs/roadmap.md`](docs/roadmap.md) — iteration plan mapping requirements to delivery order
- [`docs/adr/`](docs/adr) — architecture decision records, one per decision, in the order they
  were taken; each states the alternatives weighed and what the choice costs
- [`docs/order-lifecycle.md`](docs/order-lifecycle.md),
  [`docs/account-lifecycle.md`](docs/account-lifecycle.md) and
  [`docs/catalog-sync.md`](docs/catalog-sync.md) — what an order, an account and an automated
  catalog feed actually do, step by step; the tables and journeys are generated from the rules and
  the end-to-end tests, so they cannot describe anything unchecked
- [`docs/mail.md`](docs/mail.md) — every message the platform sends, rendered from the deployment's
  own wording

## Workflow

Trunk-based development on `main` with short-lived `feat/*` / `fix/*` branches and strict semver,
where the version says how far a release reaches (ADR 0044): a **major** changes something outside
the deploy unit — a port's contract, or a migration a person has to run; a **minor** carries new
scope, a requirement the platform did not have before; a **patch** carries none, fixing and
finishing what the last minor shipped.
Issues carry requirement IDs; iterations are tracked as GitHub Milestones and releases as GitHub Releases per tag.
