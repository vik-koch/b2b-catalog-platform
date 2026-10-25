# shared

What both apps read: the API contracts, the deployment's config schemas, and the constants and
rules the storefront and the API must agree on.

- **`*.contract.ts`** — one Zod schema per API route, implemented by the API with oRPC and
  called by the web app. A contract module exports schemas only.
- **`*-constants.ts`, `*-format.ts` and the other plain modules** — limits, enums and pure
  helpers with no imports, so a component that needs a limit does not pull Zod into the
  browser.
- **`*-config.ts`, `common-text.ts`** — the schemas a deployment's `deployment.json` and shared
  texts are loaded with.
- **`node/`** (`@b2b-catalog-platform/shared/node`) — what only runs on a server: loading the
  config directory, sanitizing rich text.

The browser never receives the schemas themselves: it gets the route metadata generated into
`apps/web/src/app/shared/core/contract-routes.generated.ts`. Regenerate it with
`node tools/generate-contract-routes.mjs` after changing a route's method, path or input and
output structure ([ADR 0043](../../docs/adr/0043-contract-layer-and-what-the-browser-downloads.md)).

`nx test shared` runs the specs; `nx typecheck shared` checks the types.
