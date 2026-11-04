# shared

What both apps read: the API contracts, the deployment's config schemas, and the constants and
rules the storefront and the API must agree on.

An entry point per audience and area, over `core/<area>` for what an area's audiences share and
`platform` for what knows no area
([ADR 0073](../../docs/adr/0073-cut-the-code-by-area-and-audience.md)).

<!-- prettier-ignore -->
| Import | Folder | What it holds |
| --- | --- | --- |
| `@b2b-catalog-platform/shared/platform` | `src/platform/` | what knows no area: the deployment config and shared texts, money and tax, text filling, API errors, the session and its roles, the areas another system may own and their refusals, phone and email formats, media upload facts, the rich-text vocabulary, form fields, pagination, keyboard layouts, ISO days |
| `@b2b-catalog-platform/shared/core/catalog` | `src/core/catalog/` | the catalog's values and rules, and the product shapes both sides draw |
| `@b2b-catalog-platform/shared/storefront/catalog` | `src/storefront/catalog/` | the storefront's catalog routes: tree, listings, facets, search, sitemap |
| `@b2b-catalog-platform/shared/admin/catalog` | `src/admin/catalog/` | the staff's catalog routes: products, categories, attributes, documents, tiers |
| `@b2b-catalog-platform/shared/core/accounts` | `src/core/accounts/` | the account's values and rules: sign-in and passwords, addresses, parties, the account shapes staff and the exchange act on |
| `@b2b-catalog-platform/shared/storefront/accounts` | `src/storefront/accounts/` | the customer's own account |
| `@b2b-catalog-platform/shared/admin/accounts` | `src/admin/accounts/` | the staff's account routes and the consent records |
| `@b2b-catalog-platform/shared/core/site` | `src/core/site/` | the fixed pages, the consent facts the forms ask with and the withdrawal reasons, the page read, the maintenance check |
| `@b2b-catalog-platform/shared/storefront/site` | `src/storefront/site/` | the inquiry, the page routes and consent paths |
| `@b2b-catalog-platform/shared/admin/site` | `src/admin/site/` | the page editor's routes and limits, and the maintenance toggle |
| `@b2b-catalog-platform/shared/core/exchange` | `src/core/exchange/` | the runs, the catalog, customer and order exchanges an upload and the back office share, the machine identity |
| `@b2b-catalog-platform/shared/admin/exchange` | `src/admin/exchange/` | the staff's run log, uploads, machine tokens and the ownership switch |
| `@b2b-catalog-platform/shared/machine/exchange` | `src/machine/exchange/` | the back office's customer and order reads |
| `@b2b-catalog-platform/shared/admin/platform` | `src/admin/platform/` | what the admin reads that knows no area: the build info, the settings trail, which areas another system owns, media uploads |
| `@b2b-catalog-platform/shared/core/work` | `src/core/work/` | the queues and the counts every signed-in account is shown |
| `@b2b-catalog-platform/shared/node` | `src/node/` | what only runs on a server: loading the config directory, sanitizing rich text, server-only settings |

An audience never imports another audience, and a staff shape and a customer shape are built
from the same core values rather than from each other. `tools/lint/area-boundaries.mjs` holds
this. Its one exception is `src/platform/config/`: the deployment schema and the shared
texts are composed of every area's section, so they import the areas' cores. The web app's
lint rules decide which entry points each of its parts may import.

- **`*.contract.ts`** — one Zod schema per API route, implemented by the API with oRPC and
  called by the web app, or in `core/` the schemas several routes are built from. A contract
  module exports schemas only.
- **`<topic>.ts`** — one topic's limits, enums, types and pure rules together, with no
  imports beyond other plain modules, so a component that needs a limit does not pull Zod
  into the browser. The topic's schemas sit beside it in `<topic>.contract.ts`. A module
  splits further only for a heavy dependency (`slugify.ts`).
- **`*-config.ts`** — the schema of one section of `deployment.json`, in the area that reads
  it; `src/platform/config/` composes them.

The browser never receives the schemas themselves: each side of the web app gets the route
metadata generated into its own `contract-routes.generated.ts`. Regenerate them with
`node tools/generate-contract-routes.mjs` after changing a route's method, path or input and
output structure ([ADR 0043](../../docs/adr/0043-contract-layer-and-what-the-browser-downloads.md)).

`nx test shared` runs the specs; `nx typecheck shared` checks the types.
