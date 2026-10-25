# 0069 — Split the web app, its texts and the contracts by audience

**Status:** accepted · **Date:** 2026-10-25

## Context

One web app serves two audiences: buyers on the storefront and staff in the
admin panel, which also reaches into storefront pages as edit mode. Its code was
organised by domain alone (`catalog/`, `orders/`, `admin/` beside them), so
nothing said which side a file served, and the imports ran both ways: storefront
pages imported admin code for edit mode, and admin screens imported storefront
components to preview a product. The texts were split by delivery (injected or
fetched), not by reader, so admin screens read the storefront's wording. The
contracts in `libs/shared` were one barrel of 85 modules, and a file such as
`orders.contract.ts` held the customer's routes and the staff's side by side;
who may call a route showed only in the API's role check.

Nx libraries for the storefront and the admin were considered. They would give
the same boundary through project tags, at three times the project
configuration, and no smaller bundle: the admin is already lazy.

## Decision

Three levels, the same at each layer, with lint rules enforcing the direction:

- **Web code:** `storefront/`, `admin/` and `shared/`. The storefront and the
  admin import shared code and never each other; shared code imports neither;
  only the root (`app.ts`, `app.config*`, `app.routes*`) composes both. Edit mode
  reaches the admin's catalog client through an injection token the root
  provides, never by import.
- **Texts:** `storefront.json` (the customers' wording, injected), `admin.json`
  (the staff's, fetched) and `shared.json` (everyone's, and the API's). Each side
  reads its own text and the shared one; shared code, which shows one side's
  view to the other, reads all three.
- **Contracts:** an entry point per audience of the route —
  `@b2b-catalog-platform/shared` (public and signed-in routes, and the shapes
  every side uses), `/storefront`, `/admin` (staff routes), `/sync` (the machine
  routes and the exchange) and `/node` (what only the server runs). A staff half
  extends the public shapes, never the reverse. Each side of the web app gets a
  generated routes file typed against its own entry points.

## Rationale

- **The line that is real there.** In the web app the audience is the boundary:
  a separate UI, its own wording, delivered differently, loaded lazily. In the
  contracts it is the role check behind each route. The API keeps its domain
  folders, because there the audience already is the controller and its guard,
  and audience folders would cut every domain in two.
- **Shared by use, not by guess.** Something enters `shared/` only when both
  sides use it: the product views the admin previews, the session, an order's
  labels. Edit mode lives there too, as the admin's controls on storefront
  pages, and its one call into the admin goes through the token.
- **Wording follows its reader.** Staff shown what a customer sees — the
  preview, an address form, the customer's version of an order — read the
  customer's wording; staff wording that only resembled it (a load error, the
  panel's titles) got keys of its own. One token per file keeps the way from a
  key to the file that holds it obvious, so the files are not merged on load.
- **Entry points, not one barrel.** With the audience in the import path, a
  storefront file cannot name a staff route by accident, and the generated
  routes it ships cannot either.
- **Lint, not the compiler.** Folders inside one project are cheap to move and
  the rule is a few lines; a wrong import fails in the editor and in CI.

## Consequences

- (+) Where a file belongs, and who may call a route, is read off its path.
- (+) A wrong-way import, static or lazy, fails lint; so does a side reading the
  other side's text.
- (−) `shared/` is the largest level in both places, because most contracts and
  the product views genuinely serve both sides.
- (−) A shape both sides need sometimes has to move to the shared level first,
  as the product page's documents and the machine token's scopes did.
- (−) Operators rename two text files and move a few keys when they upgrade;
  `migrate-config` does it from the release's map.
