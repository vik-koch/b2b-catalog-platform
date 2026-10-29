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

The audience is the first cut at each layer, with lint rules enforcing the
direction; [ADR 0073](0073-cut-the-code-by-area-and-audience.md) cuts each
audience by area and names the levels below it:

- **Web code:** `storefront/` and `admin/`, over `core/` (an area's code both
  sides use) and `platform/` (code that knows no area). The storefront and the
  admin import the levels below and never each other; those import neither;
  only the root (`app.ts`, `app.config*`, `app.routes*`) composes both. Edit mode
  reaches the admin's catalog client through an injection token the root
  provides, never by import.
- **Texts:** `storefront.json` (the customers' wording, injected), `admin.json`
  (the staff's, fetched) and `shared.json` (everyone's, and the API's). Each side
  reads its own text and the shared one; core code, which shows one side's view
  to the other, reads all three. Texts are cut by audience only, not by area.
- **Contracts:** entry points by the audience of the route —
  `/storefront/<area>` (public and signed-in routes), `/admin/<area>` (staff
  routes), `/machine/<area>` (the exchange), `/core/<area>` and `/platform` (the
  values and shapes every side uses) and `/node` (what only the server runs). A
  staff shape and a customer shape are built from the same core values and never
  import each other. Each side of the web app gets a generated routes file typed
  against its own entry points.

## Rationale

- **The line that is real there.** In the web app the audience is the boundary:
  a separate UI, its own wording, delivered differently, loaded lazily. In the
  contracts and the API it is the role check behind each route.
- **Shared by use, not by guess.** Something enters `core/` only when both
  sides use it: the product views the admin previews, an order's labels. Edit
  mode lives there too, as the admin's controls on storefront pages, and its one
  call into the admin goes through the token.
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
- (−) `core/` is the largest level in both places, because most values and the
  product views genuinely serve both sides.
- (−) A shape both sides need sometimes has to move to `core/` first,
  as the product page's documents and the machine token's scopes did.
- (−) Operators rename two text files and move a few keys when they upgrade;
  `migrate-config` does it from the release's map.
