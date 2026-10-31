# shared

What both apps read: the API contracts, the deployment's config schemas, and the constants and
rules the storefront and the API must agree on.

An entry point per audience and area, over `core/<area>` for what an area's audiences share and
`platform` for what knows no area
([ADR 0073](../../docs/adr/0073-cut-the-code-by-area-and-audience.md)). The areas move into
this shape one at a time; until they have, their modules stay in the last five entry points.

<!-- prettier-ignore -->
| Import | Folder | What it holds |
| --- | --- | --- |
| `@b2b-catalog-platform/shared/platform` | `src/platform/` | what knows no area: media upload facts, pagination, keyboard layouts, ISO days |
| `@b2b-catalog-platform/shared/core/catalog` | `src/core/catalog/` | the catalog's values and rules, and the product shapes both sides draw |
| `@b2b-catalog-platform/shared/storefront/catalog` | `src/storefront/catalog/` | the storefront's catalog routes: tree, listings, facets, search, sitemap |
| `@b2b-catalog-platform/shared/admin/catalog` | `src/admin/catalog/` | the staff's catalog routes: products, categories, attributes, documents, tiers |
| `@b2b-catalog-platform/shared/core/site` | `src/core/site/` | the fixed pages, the consent facts the forms ask with, the rich-text vocabulary, the page read and the maintenance check |
| `@b2b-catalog-platform/shared/storefront/site` | `src/storefront/site/` | the inquiry |
| `@b2b-catalog-platform/shared/admin/site` | `src/admin/site/` | the page editor's routes and the maintenance toggle |
| `@b2b-catalog-platform/shared/admin/platform` | `src/admin/platform/` | what the admin reads that knows no area: the build info, the settings trail |
| `@b2b-catalog-platform/shared` | `src/lib/` | the areas not yet moved: public and signed-in routes, and what every side reads |
| `@b2b-catalog-platform/shared/storefront` | `src/storefront/` | the customer's own account, and checkout's delivery-zone and date rules |
| `@b2b-catalog-platform/shared/admin` | `src/admin/` | the other staff routes |
| `@b2b-catalog-platform/shared/sync` | `src/sync/` | the machine API and the exchange it feeds |
| `@b2b-catalog-platform/shared/node` | `src/node/` | what only runs on a server: loading the config directory, sanitizing rich text, server-only settings |

An audience never imports another audience, and a staff shape and a customer shape are built
from the same core values rather than from each other. `tools/lint/area-boundaries.mjs` holds
this for the moved areas; for the rest, `src/lib` imports none of the other folders, an
audience's folder imports `src/lib` and itself, and the admin's also `src/sync`. The web app's
lint rules decide which entry points each of its parts may import.

- **`*.contract.ts`** — one Zod schema per API route, implemented by the API with oRPC and
  called by the web app, or in `core/` the schemas several routes are built from. A contract
  module exports schemas only.
- **`<topic>.ts`** — one topic's limits, enums, types and pure rules together, with no
  imports beyond other plain modules, so a component that needs a limit does not pull Zod
  into the browser. The topic's schemas sit beside it in `<topic>.contract.ts`. A module
  splits further only for a heavy dependency (`slugify.ts`). Areas not yet moved still name
  theirs `*-constants.ts`.
- **`src/lib/config/`** — the schemas a deployment's `deployment.json` and shared texts are loaded with.

The browser never receives the schemas themselves: each side of the web app gets the route
metadata generated into its own `contract-routes.generated.ts`. Regenerate them with
`node tools/generate-contract-routes.mjs` after changing a route's method, path or input and
output structure ([ADR 0043](../../docs/adr/0043-contract-layer-and-what-the-browser-downloads.md)).

`nx test shared` runs the specs; `nx typecheck shared` checks the types.
