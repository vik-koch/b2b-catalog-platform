# 0024 — Serve sitemap/robots from the SSR tier and gate indexing with a per-deployment env flag

**Status:** accepted (amended 2026-08-20) · **Date:** 2026-07-28

## Context

NFR-SEO-02 needs a `robots.txt` and a `sitemap.xml` generated from current
catalog content. Two questions have to be answered to build them, and neither is
settled by ADR 0022 (which only fixed how _maintenance mode_ suppresses crawling —
disallow-all `robots.txt` and a `503` `sitemap.xml` while the gate is on).

1. **Where do the two files live?** The catalog data they need is owned by the
   API, but the crawler-facing process is the Angular SSR Node server (0-config
   `NFR-SEO-01`). Options: generate them in the API (a NestJS controller) and let
   Traefik route `/robots.txt` and `/sitemap.xml` there, or serve them from the
   SSR Express server and have it pull the URL set from the API.
2. **How is indexing enabled per environment?** The same image runs three ways
   with different intent: **dev** must never be indexed (it mirrors prod content
   pre-launch); the **public demo** (Oracle) is a portfolio piece we also do not
   want competing in search results; **real private prod** must be fully indexed
   once live. The roadmap already states dev stays `noindex` and indexing is
   enabled only when prod goes live — this ADR makes that a mechanism.

These are independent of the maintenance gate: maintenance is a _temporary,
runtime_ "come back later" (503, ADR 0022); environment indexability is a
_permanent, per-deployment_ "this host is/ isn't a search target."

## Decision

**Serving location.** `robots.txt` and `sitemap.xml` are served by the **SSR
Express server** (`apps/web/src/server.ts`), registered ahead of the Angular
catch-all. The sitemap's URL set is fetched server-side from a dedicated,
read-only API endpoint (`GET /catalog/sitemap`, returning every category,
non-deleted product, and DB-backed static-page slug with its `updatedAt`); the
SSR server renders the XML, adds the code routes (which carry no `<lastmod>`,
having no content timestamp), and makes every URL absolute against
`APP_ORIGIN`. The rendered XML is cached in-process.

**Indexability flag.** A per-deployment boolean env var **`SEO_INDEXABLE`**
(default **`false`**) is the single switch:

- `robots.txt`: when `SEO_INDEXABLE` is false **or** maintenance is on →
  `Disallow: /`. Otherwise allow all and advertise `Sitemap: <APP_ORIGIN>/sitemap.xml`.
- `sitemap.xml`: `404` when not indexable; `503` while maintenance is on (ADR
  0022, surfaced from the gated API); otherwise the generated document.
- A `<meta name="robots" content="noindex">` is injected into every SSR document
  when `SEO_INDEXABLE` is false — belt-and-braces alongside `robots.txt`.

Set to `false` for dev and the public demo, and `true` only in the private prod
deployment.

## Rationale

- **SSR tier, not the API.** The SSR server is already the crawler's entry point
  and the only process that knows `APP_ORIGIN` (needed for absolute URLs) and the
  per-deployment `SEO_INDEXABLE` flag; robots/sitemap are presentation-for-crawlers,
  the same concern SSR already owns. Keeping the catalog _data_ behind a thin API
  endpoint preserves the read-model boundary (the SSR server never touches the DB)
  while keeping URL assembly and caching next to the other SEO logic. Putting the
  whole thing in the API would split SEO across two tiers and force the origin/flag
  config into the API too.
- **One env flag, not code or DB.** Indexability is fixed per deployment and known
  at boot — it is deployment identity, exactly what env/config is for, not runtime
  state like the maintenance flag (0022). An env var flips it from the private repo
  with no code change and no admin surface, and composes cleanly with the runtime
  maintenance behavior (either condition disallows).
- **Default deny.** Defaulting `false` means a new or misconfigured deployment is
  never accidentally indexed; a host has to _opt in_ to being a search target,
  which matches the "dev/demo stay out of the index" intent and fails safe.

## Consequences

- (+) NFR-SEO-02 is met with all SEO logic in one tier; the API exposes only a
  small slug list.
- (+) dev and the demo are `noindex` by construction; private prod flips one env
  var at go-live, coherent with the maintenance-gate launch flow (0022).
- (+) Two independent suppression axes (permanent env, temporary maintenance)
  combine in one place, so neither can leak the other's content.
- (−) The SSR server gains a synchronous dependency on the API for the sitemap;
  it must degrade sanely (surface the API's 503, otherwise fail closed) and cache
  to stay off the hot path.
- (−) The sitemap cache needs invalidating on catalog sync, or it serves a stale
  URL set until its TTL lapses — accepted as a short TTL for now rather than wiring
  a sync hook.
- (−) `SEO_INDEXABLE` is one more per-deployment env var to document and set
  correctly; getting it wrong on prod is the difference between indexed and not,
  so it belongs in the deployment checklist.

## Amendment — 2026-08-18: attribute filters join the canonical rule

Faceted filtering (ADR 0037) adds a third kind of listing variant beside sort
and page, and a far larger one: every combination of selected attribute values
is a distinct URL, so the space a crawler can walk is combinatorial rather than
linear. Filtered listings are therefore treated exactly as sorted and paged ones
are — the canonical points at the unfiltered category — and NFR-SEO-04 is worded
to name them. Nothing else changes: the sitemap still lists categories and
products only, so no filtered URL is ever advertised.

## Amendment — 2026-08-20 (v1.4.0): the canonical link is written by the SSR tier

The rule above said which URL a listing variant points at; it did not say who
writes the tag, and until now nothing did — NFR-SEO-04's canonical half was
unimplemented for sort and page as well as for filters. It is now
`injectCanonicalLink` in `seo.server.ts`, beside `injectNoindexMeta` and for the
same reasons: only the Node process knows `APP_ORIGIN`, and a crawler reads the
canonical solely from the initial HTML of the URL it fetched, so a client-side
navigation has no document worth updating. The href is the request path with the
query string dropped, which is what makes every sorted, paged and filtered
variant of a category resolve to the category.

Three documents get none: a view that already marked itself `noindex` (search
results — the injection runs before `injectNoindexMeta`, so that check sees only
the page's own tag and never the deployment-level one), the session routes,
which no crawler reaches, and the maintenance screen, which is not the content
of the URL it is answering.

The alternative was a `usePageSeo` option written per component. It was built
first and abandoned: it needs the public origin plumbed into the browser
injector to produce an absolute URL, it makes every component that titles a page
depend on the router's event stream, and it buys only the client-navigation case
— the one case no crawler is in.
