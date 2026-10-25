# shared

What both apps read: the API contracts, the deployment's config schemas, and the constants and
rules the storefront and the API must agree on.

One entry point per audience of a route
([ADR 0069](../../docs/adr/0069-split-web-texts-and-contracts-by-audience.md)):

<!-- prettier-ignore -->
| Import | Folder | What it holds |
| --- | --- | --- |
| `@b2b-catalog-platform/shared` | `src/lib/` | public and signed-in routes, and what every side reads, by domain: `core`, `config`, `catalog`, `orders`, `accounts`, `site` |
| `@b2b-catalog-platform/shared/storefront` | `src/storefront/` | what only the storefront uses: the customer's own account, and checkout's delivery-zone and date rules |
| `@b2b-catalog-platform/shared/admin` | `src/admin/` | staff routes; a staff half extends the public shapes |
| `@b2b-catalog-platform/shared/sync` | `src/sync/` | the machine API and the exchange it feeds |
| `@b2b-catalog-platform/shared/node` | `src/node/` | what only runs on a server: loading the config directory, sanitizing rich text, server-only settings |

`src/lib` imports none of the other folders; an audience's folder imports `src/lib` and itself,
and the admin's also `src/sync`. The web app's lint rules decide which entry points each of its
parts may import.

- **`*.contract.ts`** — one Zod schema per API route, implemented by the API with oRPC and
  called by the web app. A contract module exports schemas only.
- **`*-constants.ts`, `*-format.ts` and the other plain modules** — limits, enums and pure
  helpers with no imports, so a component that needs a limit does not pull Zod into the
  browser.
- **`src/lib/config/`** — the schemas a deployment's `deployment.json` and shared texts are loaded with.

The browser never receives the schemas themselves: each side of the web app gets the route
metadata generated into its own `contract-routes.generated.ts`. Regenerate them with
`node tools/generate-contract-routes.mjs` after changing a route's method, path or input and
output structure ([ADR 0043](../../docs/adr/0043-contract-layer-and-what-the-browser-downloads.md)).

`nx test shared` runs the specs; `nx typecheck shared` checks the types.
