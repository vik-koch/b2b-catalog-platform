# 0009 — Deliver deployment config and UI text via SSR TransferState

**Status:** accepted · **Date:** 2026-07-20

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
- A **server provider** reads/derives each value and writes it into
  **`TransferState`**; a **browser provider** reads it back from the initial
  HTML. Merged server-last, so the server wins during SSR. No `/api/config`
  endpoint, no runtime fetch.
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
2. **TransferState is consume-once, no new surface.** Values are serialized into
   the initial HTML and read on bootstrap — no extra public endpoint, no fetch
   waterfall — reusing the same mechanism as the page transfer cache.
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
- (−) Delivered values are public (visiWble in the serialized state / view
  source) — acceptable since they are non-secret by construction, but secrets
  must never be placed on these tokens.
- (−) The runtime override mechanism is deferred; until the second deployment,
  the "override" is editing the typed defaults.
- (−) More provider wiring than a baked constant, justified only because the
  runtime seam is a known near-term need.
