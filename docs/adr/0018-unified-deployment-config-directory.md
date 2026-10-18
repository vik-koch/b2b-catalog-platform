# 0018 — One mounted config directory carries the whole per-deployment config

**Status:** accepted · **Date:** 2026-07-23 · **Amended:** 2026-10-17 (the
directory's layout, which text goes where, how keys are grouped and named, one
locale, and a migration for each release that moves keys or files) — see the _Amendment_
below

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
`app-text.json`, `admin-text.json`, `inquiry-text.json`, later email templates).
Facets are split by **audience** as well as by producer: the admin wording is its
own file so it is not delivered to visitors who can never see it (ADR 0009,
amendment 2).

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
  web-SSR and the API — including a new _audience_, such as the admin text.
- (+) The image ships no shop identity or locale words; a misconfigured deployment
  fails to boot instead of silently rendering demo/English text.
- (+) The browser-delivered vs server-only boundary stays explicit; logo, favicon
  and `<title>` are overridable from the same mount, so a rebrand needs no rebuild.
- (−) The browser providers have no demo fallback: a missing TransferState is a
  loud failure rather than silent demo chrome — correct under SSR-always.
- (−) Adding a UI-text key is a coordinated change: each deployment's config must
  gain the key before upgrading, or boot fails. Deliberate, but a release note.

## Amendment — 2026-10-17 (v1.14.1): the directory's layout, and which text goes where

The text had grown in three files that repeated each other: "Company ID" six
times, the payment methods in four places, the order summary's wording inside
the mail's. `deployment.json`, which the web injects into every page, also held
what only the API acts on — how long records are kept, what a sync run may do
unattended. And every file had a variable of its own. The directory is now:

| File                | Read by                      | Holds                                                        |
| ------------------- | ---------------------------- | ------------------------------------------------------------ |
| `deployment.json`   | web (every page) and the API | the deployment's public facts                                |
| `api.json`          | API                          | the settings only the API acts on                            |
| `texts/common.json` | web (every page) and the API | shared names, and what customers read in more than one place |
| `texts/app.json`    | web (every page)             | the storefront's own wording                                 |
| `texts/admin.json`  | web (fetched by admins)      | the admin's own wording, staff's names for things            |
| `texts/mail.json`   | API                          | the messages                                                 |
| `texts/pdf.json`    | API                          | the documents the API draws                                  |

What the web reads reaches every visitor, so a setting goes to `api.json`
unless the browser needs it. `deployment.json` has one schema, in the shared
library, which both apps parse whole and strictly — before, the API read a
loose slice of it, and only the web's check caught a misspelled key. One
variable, `CONFIG_PATH`, names the directory and every file is named relative
to it, in place of the `*_FILE` variable per file the decision above
describes.

Which file a text belongs in follows four rules:

1. **One key per thing, per reader.** A name that reads the same to staff and
   customers ("Order total", "Company ID") is one key in `texts/common.json`.
   Where the readers word a set differently — order statuses, payment methods —
   the customer's set is in `texts/common.json` and staff's in `texts/admin.json`,
   never half shared. A field's label is a name; the message that checks it is
   written for its reader. Controls are the same: Cancel, Close and Remove are
   one key each in `texts/common.json`'s `actions`, unless a button names what
   it does ("Delete selection").
2. **`texts/common.json` is public.** It is injected into every page, so nothing
   only staff read belongs there — staff-only verbs (Save, Edit, Delete) are
   the admin text's `actions`. The few staff words a staff mail needs
   ("Account", "Card, arranged with the customer") are in `texts/mail.json` as
   well as `texts/admin.json`: the API does not read admin text.
3. **Who defines the set decides the file.** A set the code knows — page slugs,
   statuses, fields — is keyed in a text file. Entries a deployment invents —
   delivery zones, collection points, company-ID formats — carry their own
   wording in `deployment.json`, since a text schema cannot name them.
4. **Counting texts have one form** (ADR 0009, amendment 4).

A fact about the shop that a text would repeat is a setting, and the text
names it: the tagline is `branding.tagline`, which is the landing page's
heading and, after the name, the document title (in place of `branding.title`
above); the map provider's name is `mapProvider`, which the map notice and
the cookie banner fill in as `{provider}`.

The deployment speaks one `locale`, a BCP 47 tag at the top of
`deployment.json`. It is the language every page, mail and PDF declares and
the conventions every date, number and amount is formatted by. It replaces the
locale the currency carried, which formatted money only, so a month name can
no longer come out in another language than the sentence around it.

Recurring parts share a shape. An admin page is `{ title, intro? }` and a
confirmation dialog `{ heading, message, confirm, cancel?, warning? }`. An
absent intro draws nothing, and a dialog without its own `cancel` uses the
common one. Every optional text works one of those two ways — it is left out,
like the order summary's return notice, or a common word stands in — so none
can leave a word of another language on screen, and the whole-file rule still
holds.

Inside a file, keys group by domain, then by screen (`orders.detail`,
`products.editor`); a domain with one screen is that screen. A text only a
screen reader reads ends in `Aria`, so its translator knows nobody sees it and
it need not fit anywhere; CI fails if one is ever shown.

A release that moves keys or files ships a map,
`tools/config-migration/<version>.json`, and `tools/migrate-config.mjs` applies
it to a deployment's config directory, keeping its wording and settings. It
needs Node and nothing else, and reports what it cannot decide: wording and
settings new in the release, merged keys whose values differed, and counting
texts still in two forms. CI migrates the previous release's demo
config with the newest map and validates the result, so a forgotten key fails
there rather than in an operator's boot.

- (+) A thing is named in one place per reader; the public payload carries no
  staff wording, and no setting only the API needs.
- (+) One variable points a container at its config; a file cannot be pointed
  somewhere the others are not.
- (+) A translator reads context from the structure: where a key sits names
  its screen, and the suffix says when nobody sees it.
- (+) An upgrade that moves text is one command per deployment, not a diff to
  read by hand.
- (−) A handful of staff words exist twice, in the admin and the mail text.
- (−) Each release that moves keys or files owes a map, kept complete by the
  CI check.
