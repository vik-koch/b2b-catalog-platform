# 0073 — Cut every layer by area and audience, with a core per area

**Status:** accepted · **Date:** 2026-10-29

## Context

[ADR 0069](0069-split-web-texts-and-contracts-by-audience.md) split the web app and the
contracts by audience; the API kept its domain folders. No layer drew lines between
domains, and the audience line stopped at the API: `AdminCatalogController` injects the
storefront's `CatalogService`, `users/` and `account/` import each other, `mail/` imports
`orders/`. The shared levels took whatever had no owner: `web/shared/catalog` and
`web/shared/config` hold some 4,700 lines each, and the contract library keeps the same
kind of rule in three places (`lib/catalog/product-parts.ts`, `admin/product-content.ts`).
Most of the code is written with an agent, which follows the nearest example and the
shortest import, so a boundary lint does not hold is not held.

Considered:

- **An Nx library per slice**, tagged and held by `@nx/enforce-module-boundaries`. The same
  boundary plus build caching, at a `project.json`, tsconfig and lint config per slice: some
  forty projects for one developer and one deployable per app, and a library does not move
  as cheaply as a folder.
- **Area first** (`api/catalog/{storefront,admin}`). It keeps an area in one folder, but the
  web app is cut audience first for its lazy bundles and texts, and one shape at every
  layer reads better than the better shape in some.
- **Ports and repositories around Drizzle.** The database is not going to be swapped, and a
  service that writes its own queries is easier to read than one behind an interface.

## Decision

The API, the contract library and the web app are each cut into `<audience>/<area>/`, with
`core/<area>/` for what an area's audiences share and `platform/` for what knows no area.
The audiences are `storefront`, `admin` and `machine` (the web app has no machine). Four
rules, held by `eslint-plugin-boundaries`:

1. **An audience never imports another.** Only roots compose them: the app root and
   `app.module`, and inside an audience its `shell/` (routes, layout, panel page).
2. **Downwards only:** audience → core → platform. Platform imports no area.
3. **Between areas, only along the table**, at the same level or downwards:
   `admin/ordering` may import `admin/catalog` or `core/catalog`, never the reverse.
4. **The rule of two:** code enters `core/` when a second audience uses it, not before.

<!-- prettier-ignore -->
| Area | Holds | May import |
|---|---|---|
| catalog | products, categories, attributes, documents, tiers and their prices | exchange |
| accounts | users, sign-up and sign-in, addresses, parties, consents | catalog, site, exchange |
| site | pages, shop settings and switches, inquiry | — |
| ordering | cart, checkout, orders and their versions, order documents and PDFs | catalog, accounts, site, exchange |
| exchange | runs, cursors, ownership, machine tokens | — |
| work | the staff's and the customers' queues | catalog, accounts, ordering, exchange |
| retention | the destruction record, retention sweeps | accounts, ordering |

**Platform** holds the database, deployment config and texts, oRPC and the HTTP client,
guards and the session, mail transport and layout, the media store, PDF rendering, audit,
throttling and the suggestion sidecar. An area's mails live in its core; platform renders
and sends them. Each audience may keep its own `platform/` for area-free pieces only it
uses (the admin's grid, dates, rich text, image picker).

**Contracts:** an entry point per audience and area (`@b2b-catalog-platform/shared/admin/catalog`),
plus `/core/<area>`, `/platform` and `/node`, mapped by one wildcard path. A resource's shape
is defined per audience; both build it from the area's core values (price, packaging,
picture, availability) and never import each other's. Texts stay per audience, as ADR 0069
has them.

## Rationale

- **Copying structure is cheap, copying a rule is not.** A second controller and a second
  response shape cost a few lines; a second copy of which price applies or what is publicly
  visible becomes a bug the day the two drift. Core is where the rule exists once.
- **The audience at the top** is the line with consequences at every layer: a guard in the
  API, an entry point in the contracts, a lazy bundle and a text file in the web app.
- **The table is the domain's direction.** An order refers to products and customers;
  nothing in the catalog refers to an order. A customer is on a tier, so accounts imports
  catalog; a tier is a price list, so it is catalog's.
- **Exchange is an area**, so its shared machinery has one home and `machine/catalog` holds
  the catalog's exchange beside the catalog's other audiences.
- **Core and platform are named for what they hold.** A `shared/` level says who may use
  something, not what it is, and collects what has no owner; the rule of two and an area
  per core keep that from repeating.
- **One table in lint** replaces `no-restricted-imports` blocks that each repeat the others
  because a later block replaces an earlier one. An Nx tag would read the same, and is the
  move if a slice is ever built or released on its own.

## Consequences

- (+) A file's area and audience are read off its path; a wrong-way import fails lint, for
  a person and an agent alike.
- (+) Today's cycles (`users` ↔ `account`, `auth` ↔ `users`, `mail` ↔ `orders`) have to be
  broken to pass.
- (−) More folders and some twenty entry points; a resource's shape exists once per
  audience.
- (−) Admin-only code that resembles a storefront piece stays apart until a second audience
  really needs it.
- (−) The moves touch every file. They go area by area, catalog first, with the lint
  switched on per area, so both shapes stand side by side until the last one.
