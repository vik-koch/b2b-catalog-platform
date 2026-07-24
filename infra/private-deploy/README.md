# Private deployment (template)

A worked template for deploying this platform to a **real client** from a
**private** repo, consuming only public artifacts — matching the ports-and-adapters
split in the architecture. Copy [`deploy-prod.yml`](deploy-prod.yml) into your
private repo as `.github/workflows/deploy-prod.yml` and adapt.

It is **inert here** (GitHub runs only workflows under `.github/workflows/`); it
lives in `infra/` so this public repo's Actions tab stays clean.

## How it differs from the public prod deploy

|                | Public prod (this repo, `release.yml`) | Client prod (private repo, this template)           |
| -------------- | -------------------------------------- | --------------------------------------------------- |
| Trigger        | push a `v*.*.*` tag                    | manual `workflow_dispatch` (pick a version)         |
| Image          | just-promoted version tag              | same public GHCR version tag                        |
| Platform files | in-repo                                | `actions/checkout` of this repo at `v<version>`     |
| Config         | committed demo `config/`               | the **private** repo's own `config/` (`CONFIG_DIR`) |
| Mail           | Mailpit sink + reviewer inbox          | **real SMTP**, no Mailpit                           |
| Seeding        | never                                  | never (catalog arrives via admin bulk sync)         |

## What the private repo owns

1. **`config/`** — a _complete_ deployment config (branding, text, wording,
   `assets/`). Loaded whole with no baked default, so a missing file fails the
   boot. Start from this repo's [`config/`](../../config) and replace the
   contents.
2. **`.github/workflows/deploy-prod.yml`** — the copied template.
3. **Secrets & variables** (private repo → Settings → Secrets and variables → Actions):

   | Secret                        | Content                                                              |
   | ----------------------------- | -------------------------------------------------------------------- |
   | `DEPLOY_SSH_PRIVATE_KEY`      | Private half of the VM's `deploy` key                                |
   | `POSTGRES_PASSWORD`           | DB password — **stable across deploys** (the volume keeps the first) |
   | `MAIL_USER` / `MAIL_PASSWORD` | Real SMTP credentials                                                |
   | `GRAFANA_ADMIN_PASSWORD`      | Only if you enable central logs                                      |

   | Variable                                                    | Content                                                                                            |
   | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
   | `DEPLOY_HOST`                                               | Client VM public IP / DNS (SSH target)                                                             |
   | `APP_DOMAIN`                                                | Public hostname (A record → `DEPLOY_HOST`, DNS-only behind Cloudflare)                             |
   | `ACME_EMAIL`                                                | Let's Encrypt account email                                                                        |
   | `MAIL_HOST` / `MAIL_PORT` / `MAIL_FROM` / `MAIL_CONTACT_TO` | SMTP provider + addresses                                                                          |
   | `MAIL_SECURE`                                               | `true` for implicit TLS (465), else `false`                                                        |
   | `STACK_NAME`                                                | Optional; defaults to `prod`. Set a distinct name only if the VM already runs another `prod` stack |
   | `GRAFANA_DOMAIN`                                            | Optional; set with `GRAFANA_ADMIN_PASSWORD` to turn on central logs                                |

Nothing else is copied — `deploy.sh`, `compose.yml`, and the Traefik/observability
stacks all come from the checked-out `platform/` at the chosen tag, so they always
match the image you deploy.

## Prerequisites (once per VM)

The [main infra README](../README.md) covers this; in short:

- A VM meeting the [requirements](../README.md#vm-requirements), provisioned with
  [`cloud-init.yml`](../cloud-init.yml) (Docker + the `deploy` user + your deploy
  public key). Reuse the same key across VMs, or generate a client-specific one.
- Firewall open on 22/80/443.
- DNS A record for `APP_DOMAIN` → the VM, DNS-only (grey cloud) so Traefik's
  HTTP-01 challenge works.

A client's real prod should be its **own, client-owned VM**, isolated from other
infrastructure. Traefik + observability are per-VM singletons, so the same VM can
host several stacks (dev / prod / a client-prod rehearsal) — pick a distinct
`STACK_NAME` + `APP_DOMAIN` per stack; Traefik routes them by hostname.

## Running it

Actions → **Deploy prod** → Run workflow → enter the released version (e.g.
`0.1.0`). It checks out the platform at `v0.1.0`, builds the prod `.env` from your
secrets, and runs `deploy.sh` with your private `config/` — no Mailpit, unseeded.
