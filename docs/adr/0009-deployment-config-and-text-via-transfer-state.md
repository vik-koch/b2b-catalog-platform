# 0009 — Deliver deployment config and UI text in the served document

**Status:** accepted · **Date:** 2026-07-20 · **Amended:** 2026-07-25 (delivery
mechanism: TransferState → an injected `<script>`), 2026-07-30 (the text is split
by audience; the admin half is fetched) — see the _Amendments_ below

## Context

The app chrome needs two kinds of per-deployment values: **configuration**
(branding name/logo, feature flags such as cookie-consent enablement, contact
locations) and **UI text** (nav labels, consent copy, error messages,
taglines). Several constraints bear on how these reach the browser:

- The client deployment **consumes the public Docker images** and configures
  them (0007 build-once-promote); it must not rebuild to change branding or
  text. So per-deployment values have to be a **runtime** concern.
- Text is **single-locale** — each deployment ships one language; i18n (a
  runtime language switcher, message catalogs) is explicitly out of scope.
  "Translatable per deployment" here means "externalized from source, written in
  that deployment's one language."
- These values are **non-secret by construction**: the browser needs them to
  render, so anything delivered is inherently public.
- The chrome renders under SSR, and hydration must not refetch or mismatch.

Alternatives considered: (a) a DB `config` row (JSON blob) exposed via a public
`/api/config` endpoint; (b) build-time constants, or Angular's `@angular/localize`
for the text; (c) values read on the server and handed to the browser via
Angular `TransferState` behind DI tokens.

## Decision

- Two DI tokens — **`DEPLOYMENT_CONFIG`** (non-text: branding, flags, locations)
  and **`APP_TEXT`** (the single-locale text catalog) — resolve the values.
- A **server provider** reads/derives each value from the mounted file; a
  **browser provider** reads it back out of the served document. Merged
  server-last, so the server wins during SSR. No `/api/config` endpoint, no
  runtime fetch. (Originally the channel was `TransferState`; see _Amendment_.)
- **Text is kept separate from config** (`APP_TEXT` vs `DEPLOYMENT_CONFIG`) so
  growing copy has its own home and a deployment can override the whole catalog
  as one unit. Navigation **structure** (which routes, order) is fixed code, not
  config; only labels are text.

## Rationale

1. **The deployment model forces runtime delivery.** Build-time constants or
   `@angular/localize` bake text into per-locale bundles, which would make the
   private client repo rebuild public images — contradicting build-once-promote
   (0007) and the consume-public-artifacts rule. This is the same force that
   decided runtime theming in 0008, which already anticipated "SSR-injected from
   deployment config."
2. **The document is consume-once, no new surface.** Values are serialized into
   the initial HTML and read on bootstrap — no extra public endpoint, no fetch
   waterfall.
3. **The DI token is the durable seam.** Consumers inject a token; whether it is
   backed today by a compile-time default or later by a mounted per-deployment
   override file can change without touching a single consumer.
4. **A DB blob is the wrong home for deployment identity.** Deployment config is
   environment-specific — a prod→dev data restore would drag it along — so it
   belongs with the deployment, not the customer data. A whole-config endpoint
   also invites over-exposure. DB-backed config is reserved for genuine
   admin-edit-at-runtime needs, and then only as a typed public projection.

Concessions: `@angular/localize` is the idiomatic tool for externalized UI
strings and would ease a future multi-locale build — but it does not give
runtime language switching either (that would be a runtime message system, an
evolution of `APP_TEXT`, not `@angular/localize`), and it loses on the rebuild
constraint. Two tokens plus server/browser provider pairs is more wiring than a
plain constant — accepted as the price of the runtime-override seam. The
per-deployment override backing (a mounted file merged over the defaults) is not
built yet; the public repo ships typed defaults and the seam awaits the second
deployment.

## Consequences

- (+) One public image serves differently-branded, differently-worded
  deployments; branding/text/flags are runtime config, not a release.
- (+) No extra public endpoint and no client fetch; values arrive once in the
  initial HTML, SSR-clean.
- (+) i18n stays out of scope while text is still fully externalized;
  `APP_TEXT` upgrades cleanly to a runtime message system if multi-locale is
  ever required.
- (+) Config and text have distinct homes; nav structure stays code, so only
  genuinely per-deployment values are configurable.
- (−) Delivered values are public (visible in the serialized state / view
  source) — acceptable since they are non-secret by construction, but secrets
  must never be placed on these tokens.
- (−) The runtime override mechanism is deferred; until the second deployment,
  the "override" is editing the typed defaults.
- (−) More provider wiring than a baked constant, justified only because the
  runtime seam is a known near-term need.

## Amendment 1 — 2026-07-25: the channel is the document, not TransferState

`TransferState` only exists in SSR output. Using it as the config channel meant
**every** route had to be server-rendered, including the session-scoped ones
(`/login`, `/admin`, `/account`) — which are not crawler-visible, are never
cold-loaded, and which the server cannot render meaningfully anyway, since it
resolves no session (0019). Server rendering them produced only a placeholder,
and cost a `SessionGate` component, SSR branches in both route guards, and a
hydration wait in the e2e specs to work around forms being rebound after paint.

The binding constraint was never TransferState — it is that a per-deployment
value cannot live in a build artifact (0007), so the boot document must come
from the running Node process. That is satisfied by the Node server injecting a
`<script id="app-shell-state" type="application/json">` into every HTML document
it serves, server-rendered page and client-rendered shell alike (`<` escaped, so
no config string can close the tag early). The DI tokens — rationale 3, the part
that actually mattered — are untouched; only the browser providers' source
changed.

Consequently: config delivery is now a **shell** concern, uniform across render
modes, and `TransferState` is left to what it is for (per-render data, e.g. the
page transfer cache). Session-scoped routes are `RenderMode.Client`; content
routes stay `RenderMode.Server`. The cost is ~40 lines of injection in
`server.ts` in place of the framework's own serializer, and one more thing that
must not break: a document served without the script fails loudly at bootstrap
rather than rendering empty chrome.

## Amendment 2 — 2026-07-30: split the text by audience, fetch the admin half

The single `AppText` catalog grew to 12.6 kB as the admin surfaces landed, and
**63% of it was admin wording** — editors, management screens, the sync diff.
All of it was injected into every document, so every anonymous page view carried
~8 kB of text no visitor could ever see.

The text is therefore split by **audience**, not by feature: `AppText`
(`app-text.json`) is what a logged-out visitor can reach — including the login
form and the public maintenance screen — and `AdminText` (`admin-text.json`) is
everything behind an admin session. Both keep the whole ADR-0018 contract: own
`.strict()` schema, own `*_FILE` env var, complete-or-die at boot.

**The admin half is fetched, not injected**, from a new `/admin-text.json` route
on the SSR tier. This is forced by amendment 1's own consequence: the shell
state is written into _every_ document, identically, because the server is
session-blind (0019). Varying the document by who is asking would fork the page
cache per visitor and put session-dependent content in HTML that is cached and
crawled. A fetch keeps the document uniform. The file is not secret — it is
wording, served unauthenticated and cached like a static asset — the split is
about payload and audience, not access control.

The asynchrony is confined to two places rather than to ~20 components:
`adminTextGuard` holds an admin route's activation until the text lands, and
`EditModeService.enabled()` stays false until then, which gates every inline
storefront affordance. Behind both, `ADMIN_TEXT` resolves synchronously exactly
as `APP_TEXT` does, so consumers are unaware of the difference.

Consequently: adding an audience later (a signed-in customer's account text, a
manager's subset) is another file on the same mechanism, not a new mechanism.

- (+) ~8 kB less in every anonymous document; the admin schema never enters the
  browser bundle (it never did — only the values were shipped).
- (+) The audience boundary is now enforced by the file layout, so admin wording
  cannot drift back into the public payload unnoticed.
- (−) One extra request for an admin, and two new failure modes to keep in mind:
  a route that renders admin text without the guard, and a storefront affordance
  that does not gate on `EditModeService.enabled()`. Both fail loudly (the token
  throws) rather than rendering blank labels.
