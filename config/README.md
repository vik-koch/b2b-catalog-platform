# Per-deployment config

This directory is bind-mounted read-only into **both** the `web` and `api`
containers at `/config` (see `compose.yml`). It is the single per-deployment
config surface branding, text and wording are retuned here without
rebuilding the public image.

The public repo commits the **demo (Coffee Kontor) config** here; dev, demo, the
local smoke test and the unit tests all run on it. A real deployment ships its
own copy instead (via `CONFIG_DIR`, see below) and never commits it here.

## The files

- `deployment.json` → `DeploymentConfig` (branding, contact, locations,
  cookie-consent flag, whether orders carry an invoice address, phone and
  company-id input rules, address rules, currency, collection points, delivery
  zones, order-reference format).
  **Browser-delivered** via shell state, and **also loaded by the API**, which
  reads the halves an order depends on: it validates a submitted collection
  point, resolves the delivery zone itself rather than trusting the browser's,
  formats money for the mails, and mints the order reference.
- `app-text.json` → `AppText`, the **public** UI-text catalog (nav labels,
  storefront chrome, the login form, error messages).
  **Browser-delivered** via shell state.
- `admin-text.json` → `AdminText`, the wording of the **admin** surfaces
  (editors, management screens, catalog sync, storefront edit mode).
  **Browser-delivered on demand**: fetched from `/admin-text.json` once an admin
  needs it, rather than injected into every visitor's document (ADR 0009,
  amendment 2). Non-secret, like everything else on this side of the line.
- `mail-text.json` → `MailText`, the wording of every email the app sends, one
  section per message. **Server-only** — rendered in the API, never sent to a
  browser. The mails' branding (shop name, header colour) and their money
  formatting come from `deployment.json`.

Each container is pointed at its file by the stack `.env` (compose defaults them
to the paths below, so this is only needed to rename a file):

```
DEPLOYMENT_CONFIG_FILE=/config/deployment.json   # web + api
APP_TEXT_FILE=/config/app-text.json              # web
ADMIN_TEXT_FILE=/config/admin-text.json          # web
MAIL_TEXT_FILE=/config/mail-text.json            # api
```

A deployment may also mount a **common-password blocklist** — a plain
newline-separated file of passwords to refuse, named by `PASSWORD_BLOCKLIST_FILE`
(api). It is optional and has no default: which passwords are common depends on
the language a deployment's customers think in, so the list belongs to the
deployment rather than to this repo. Published top-N lists are the usual source.
Without one, the length floor and the pattern rules still apply. The committed
demo list is deliberately short; replace it, do not extend it in this repo.

> The browser-delivered vs server-only split is deliberate: values on the web
> tokens end up in page source, so never put anything sensitive there. Keeping
> the files separate keeps that line visible (ADR 0018).

Each file must be **complete** (no partial overrides). The authoritative shape of
each is its Zod schema: `apps/web/src/app/config/deployment-config.type.ts`,
`.../app-text.type.ts`, `.../admin-text.type.ts`, and
`apps/api/src/mail/mail-text.ts`. The API reads its own narrower slice of
`deployment.json` through `apps/api/src/config/deployment-config.ts`, so the web
schema stays the authority on the whole file. The committed demo files are the
worked example to copy from.

## Assets (logo, favicon, fonts)

Per-deployment **assets** live in an `assets/` **subdirectory** of this mount:

```
config/
  deployment.json      # web + api config  (browser-delivered)
  app-text.json        # web public text   (browser-delivered)
  admin-text.json      # web admin text    (fetched by admins)
  mail-text.json       # api email wording (server-only)
  password-blocklist.txt # api password rules  (server-only)
  assets/
    logo.svg
    favicon.svg
    favicon.png
    fonts/             # optional: @font-face css + woff2 files
```

The path of the folder is defined by the following environment variable:

```
CONFIG_ASSETS_DIR=/config/assets                 # web
```

The web SSR server serves `assets/` ahead of the baked static files: a request
for `/logo.svg` or `/favicon.svg` is answered from `config/assets/`.

> Only `assets/` is web-served — never the mount root. The `*.json` (especially
> the **server-only** `mail-text.json`) sit beside it and are never reachable
> from a browser.

`logo.svg` is drawn as a **CSS mask**, not as an image: it takes the theme's
colours, so it answers a pointer with the accent like every other control in the
header. That means it renders in **one colour** whatever the file contains —
draw it as a single-colour mark, and let the shapes rather than the fills carry
it. Its companion in `deployment.json` is `branding.logo`, its intrinsic
`width` and `height` copied off the file. The header always draws the
logo 40px high, so these are not a display size — they are what lets the browser
keep the logo's space before the file has arrived, instead of letting the search
field beside it take the width and hand it straight back. Replace the logo with
one of another shape and these two go with it.

A deployment that wants its own typeface adds `branding.font` to
`deployment.json`:

```json
"font": {
  "family": "'Some Sans', system-ui, sans-serif",
  "stylesheet": "fonts/fonts.css"
}
```

`emphasisWeight` (100-900) belongs in the same block: it is the weight a price
is set in, and how heavy that should be is a property of the face. The app ships
700, which is a clear step up from the body text in the system stack and too
much in a family whose medium and semibold are close together — set it there
rather than looking for the places a price is drawn.

`family` is applied to everything the app draws. `stylesheet` is a path under
`assets/` holding the `@font-face` rules, linked into every document by the SSR
server; put the `woff2` files beside it and reference them relatively. Serving
them from the deployment's own origin rather than a font CDN is the point — a
CDN link makes every visitor's browser announce itself to a third party before
the page has drawn, which is also a consent question nobody wants to answer.
Omit `font` entirely to keep the system stack.

The document `<title>` is not an asset: it is `branding.title` in
`deployment.json`, set at runtime so it needs no rebuild either.

## Deploying a real deployment's config

`infra/deploy.sh` fills the VM's `/config` from `CONFIG_DIR`. It defaults to this
repo's committed demo config; a real deployment sets `CONFIG_DIR` to its own
directory of files (held in the private deployment repo), copied into
`/srv/b2b/<stack>/config` before the stack starts.
