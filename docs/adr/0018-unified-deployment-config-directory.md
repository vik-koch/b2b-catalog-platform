# 0018 — One mounted config directory carries the whole per-deployment config

**Status:** accepted · **Date:** 2026-07-23

## Context

Per-deployment configuration is arriving in several places: web **config**
(`DeploymentConfig`) and **UI text** (`AppText`) delivered to the browser via SSR
TransferState (0009); the API's server-only inquiry-email wording
(`InquiryText`); email templates (deferred by 0014); and branding **assets**
(logo, favicon, `<title>`) baked into the web image. Left alone these fragment
into unrelated mechanisms, each wired separately.

Two things shape the decision. First, **everything in this surface is
per-deployment.** Subtract what other channels own (static-page bodies and the
catalog are DB-seeded data; framework strings belong to Angular) and what remains
is shop **identity** plus one locale's **words** — no framework default hides in
it. Configurability is a stated purpose of the project, so baking a shop's
identity or a locale's wording into the image is a category error, and a hazard:
a baked default is something a misconfigured deployment can silently fall back to,
surfacing the demo name or English text in production, found only in use.

Second, one distinction is load-bearing: **browser-delivered** values
(`DeploymentConfig`, `AppText`) end up in page source, so a secret must never sit
on them (0009); **server-only** values (`InquiryText`) never leave Node.

## Decision

A single **`./config` directory** is the whole per-deployment config surface,
bind-mounted read-only into **both** the `web` and `api` containers at `/config`.
Each facet is a separate `.strict()` Zod-validated JSON file (`deployment.json`,
`app-text.json`, `inquiry-text.json`, later email templates).

**The image ships only schemas, never values.** Each process **requires** its
file (via its `*_FILE` env var), loads it **whole**, and validates the complete
object at boot. There is no partial merge and no built-in default: an unset var,
a missing file, a missing key, an unknown key, or a wrong type each **fails the
boot**. `.strict()` catches typos and wrong types; requiring the whole object
catches omissions — together they make a wrong-identity or wrong-locale string
impossible to ship silently.

The **Coffee Kontor demo is itself a committed `config/`** in this repo,
bind-mounted in dev/demo/local like any deployment — so the demo is delivered
through the same mechanism as prod and lives only in `config/`, never in the
image. A real deployment supplies its own via `CONFIG_DIR` (private repo).

The **browser-vs-server split stays visible as separate files.** The browser
providers carry no baked fallback: SSR always writes the TransferState, so a
missing key is a bug surfaced loudly rather than rendered empty. Per-deployment
**assets** ride the same mount from an `assets/` **subdir** the web SSR server
serves ahead of the baked static — only that subdir is web-served, so the sibling
`*.json` (notably the server-only one) can't leak to a browser. The `<title>` is
a config field (`branding.title`), set at runtime via the Angular Title service.

## Rationale

1. **The image carries the schema, never the values.** This surface is 100%
   per-deployment; baking values contradicts the configurable-by-design purpose
   and creates something a deployment can silently fall back to.
2. **Load whole or don't start.** Single-locale means a partial config is a silent
   wrong-words leak, not a convenience. Validating the complete file turns a
   forgotten key into a boot failure; and a UI string added in a release makes
   every existing config fail loud until translated — correct for a no-i18n app.
3. **The demo is delivered as a deployment.** Committing the demo `config/` gives
   one code path across dev and prod, keeps demo values out of the image, and
   doubles as the always-valid worked example.
4. **Keep the mechanism and the safety line simple.** One mount + one
   load-and-validate rule + one deploy path; separate files (and serving only the
   `assets/` subdir) keep a server-only value from ever reaching page source.

## Consequences

- (+) One per-deployment surface: a `config/` folder + one `CONFIG_DIR`; a new
  facet is a new file, not a new mechanism, with the same fail-loud rule in
  web-SSR and the API.
- (+) The image ships no shop identity or locale words; a misconfigured deployment
  fails to boot instead of silently rendering demo/English text.
- (+) The browser-delivered vs server-only boundary stays explicit; logo, favicon
  and `<title>` are overridable from the same mount, so a rebrand needs no rebuild.
- (−) The browser providers have no demo fallback: a missing TransferState is a
  loud failure rather than silent demo chrome — correct under SSR-always.
- (−) Adding a UI-text key is a coordinated change: each deployment's config must
  gain the key before upgrading, or boot fails. Deliberate, but a release note.
