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
  cookie-consent flag, phone input). **Browser-delivered** via SSR TransferState
  (ADR 0009).
- `app-text.json` → `AppText` UI-text catalog (nav labels, copy…).
  **Browser-delivered.**
- `inquiry-text.json` → `InquiryText`, the inquiry email wording. **Server-only**
  — rendered in the API, never sent to a browser.

Each container is pointed at its file by the stack `.env` (compose defaults them
to the paths below, so this is only needed to rename a file):

```
DEPLOYMENT_CONFIG_FILE=/config/deployment.json   # web
APP_TEXT_FILE=/config/app-text.json              # web
INQUIRY_TEXT_FILE=/config/inquiry-text.json      # api
```

> The browser-delivered vs server-only split is deliberate: values on the web
> tokens end up in page source, so never put anything sensitive there. Keeping
> the files separate keeps that line visible (ADR 0018).

Each file must be **complete** (no partial overrides). The authoritative shape of
each is its Zod schema: `apps/web/src/app/config/deployment-config.ts`,
`.../app-text.ts`, and `apps/api/src/inquiry/inquiry-text.ts`. The committed demo
files are the worked example to copy from.

## Assets (logo, favicon)

Per-deployment **assets** live in an `assets/` **subdirectory** of this mount:

```
config/
  deployment.json      # web config      (browser-delivered)
  app-text.json        # web text        (browser-delivered)
  inquiry-text.json    # api email wording (server-only)
  assets/
    logo.svg
    favicon.svg
    favicon.png
```

The web SSR server serves `assets/` ahead of the baked static files: a request
for `/logo.svg` or `/favicon.svg` is answered from `config/assets/`.

> Only `assets/` is web-served — never the mount root. The `*.json` (especially
> the **server-only** `inquiry-text.json`) sit beside it and are never reachable
> from a browser.

The document `<title>` is not an asset: it is `branding.title` in
`deployment.json`, set at runtime so it needs no rebuild either.

## Deploying a real deployment's config

`infra/deploy.sh` fills the VM's `/config` from `CONFIG_DIR`. It defaults to this
repo's committed demo config; a real deployment sets `CONFIG_DIR` to its own
directory of files (held in the private deployment repo), copied into
`/srv/b2b/<stack>/config` before the stack starts.
