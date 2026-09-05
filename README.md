# b2b-catalog-platform

A B2B catalog and ordering platform for small wholesale/retail businesses: browsable product
catalog, tiered customer pricing, order-request checkout with manager review, and admin-driven
catalog management with file-based bulk sync.

> **Status:** `v1.7.0` — products paired with what they are sold with, mutually and from
> either side: a marker wherever the product can be bought that opens its counterparts to be
> added on the spot, and a cart that says which lines are short and by how much — advisory,
> or refused at checkout where a deployment says so. Iterations 1–9 are delivered (static
> pages and infrastructure, catalog + admin panel, search, accounts and tiered pricing, units
> of sale, attribute filtering, cart and checkout, stock availability and work-awaiting
> indicators, sold-together sets). Iteration 10 (product documents and certificates) is next.

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
- **Compliance** — configurable legal pages, cookie consent, third-party licence attribution

Planned:

- **Product documents** — datasheets and certificates on a product page, with expiry tracking
- **Order processing** — status transitions, payment PDF, order PDF
- **Payment** — bank transfer or card, with manual delivery/pickup coordination

## Documentation

- [`docs/requirements.md`](docs/requirements.md) — requirements to the project
- [`docs/roadmap.md`](docs/roadmap.md) — iteration plan mapping requirements to delivery order
- [`docs/adr/`](docs/adr) — architecture decision records, one per decision, in the order they
  were taken; each states the alternatives weighed and what the choice costs

## Workflow

Trunk-based development on `main` with short-lived `feat/*` / `fix/*` branches and strict semver,
where the version says how far a release reaches (ADR 0044): a **major** changes something outside
the deploy unit — a port's contract, or a migration a person has to run; a **minor** carries new
scope, a requirement the platform did not have before; a **patch** carries none, fixing and
finishing what the last minor shipped.
Issues carry requirement IDs; iterations are tracked as GitHub Milestones and releases as GitHub Releases per tag.
