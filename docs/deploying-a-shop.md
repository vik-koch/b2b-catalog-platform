# Deploying a shop

How to run your own shop on the platform: what a deployment consists of, what you decide for
it, and how it is deployed and upgraded. The details of each step are in
[infra/README.md](../infra/README.md) (the server) and the
[configuration reference](../deployments/fixture/config/README.md) (every file and setting).

## What a deployment is

A shop is the public image plus four things of its own, kept in a private repository:

<!-- prettier-ignore -->
| Part | What it holds | Reference |
| --- | --- | --- |
| **Config directory** | `deployment.json` (the shop's public facts and switches), `api.json` (what only the API reads), five text files with every word the shop shows or sends, and `assets/` (logo, favicon, fonts) | [configuration reference](../deployments/fixture/config/README.md) |
| **Stack environment** | the domain, the database password, the session key, the first admin, the mail server, backups, and the addresses of any provider containers | [.env.stack.example](../.env.stack.example) |
| **Deploy workflow** | a GitHub Actions workflow that deploys a released version to your VM | [private-deploy template](../infra/private-deploy/README.md) |
| **Compose overlay** (optional) | containers of your own beside the stack: an ERP adapter, a provider for address suggestions or sign-in codes | [.env.stack.example](../.env.stack.example) |

The config directory is loaded whole: there are no defaults in the image, and a missing or
unknown key stops the boot and names the key. A demo deployment also has a seed bundle of
sample content; a real shop starts empty and is filled in the admin panel or by an import.

## Setting it up

1. **Get a VM.** Any provider: two vCPUs, 2–4 GB of memory, Ubuntu, provisioned with the
   repository's cloud-init file, and a DNS record pointing at it
   ([infra/README.md](../infra/README.md#manual-setup-without-terraform)).
2. **Start the config from the closest deployment.** Copy
   [deployments/slaney-labware-ie/config](../deployments/slaney-labware-ie/config) for an
   English, companies-only shop or [coffee-kontor-de](../deployments/coffee-kontor-de/config)
   for a German one that also sells to private buyers. Then rewrite what is about one shop:
   `branding`, `seller`, `contact`, `locations` and their map embeds, `mapProvider`, `pickup`
   and `delivery` in `deployment.json`, the shop-specific texts at the top of `texts/app.json`, and the assets
   ([what describes your shop](../deployments/fixture/config/README.md#what-describes-your-shop)).
   For another language, translate the five text files.
3. **Make the decisions below.**
4. **Check it.** In a checkout of the release you will deploy, after `npm ci`, run
   `node tools/check-deployments.mjs --config-dir <your config>`. It loads every file the way
   the apps do and names each key that fails, so a mistake shows here rather than on the
   server.
5. **Deploy.** Copy the workflow template into your private repository, add the secrets it
   lists, and run it with a released version
   ([private-deploy template](../infra/private-deploy/README.md)).
6. **Fill the shop before opening it.** Sign in as the first admin and change the password.
   Switch on maintenance mode, which closes the storefront to everyone but staff. Write the
   pages, enter or import the catalog, publish the products, then switch maintenance mode off.

## The decisions

<!-- prettier-ignore -->
| Decision | Setting | File |
| --- | --- | --- |
| The language and the formats of dates, numbers and money | `locale`, `catalog.currency` | `deployment.json` |
| Who the shop sells to: companies, private persons or both | `customerTypes` | `deployment.json` |
| Whether prices include tax, exclude it or carry none; the default rate | `tax` | `deployment.json` |
| Pickup points, delivery zones and their free-delivery thresholds | `pickup`, `delivery` | `deployment.json` |
| Whether an order asks for a separate invoice address | `billingAddressEnabled` | `deployment.json` |
| How phone numbers, company numbers and addresses are checked | `phoneInput`, `companyIdInput`, `address` | `deployment.json` |
| What an order reference looks like | `orderReference` | `deployment.json` |
| Which pages are published, and where they are linked | `pages` | `deployment.json` |
| The cookie banner, and consent to processing personal data | `cookieConsentEnabled`, `consent` | `deployment.json` |
| A second sign-in step through the account's phone | `signInStep`, plus a provider container | `deployment.json`, environment |
| When stock reads "few left", whether pairings are enforced, sort controls | `catalog` | `deployment.json` |
| A second keyboard layout for search | `search.alternateLayout` | `deployment.json` |
| A notice above every page, links to the shop elsewhere, the seller line | `notice`, `elsewhere`, `seller` | `deployment.json` |
| Whether the receipt attaches the terms of sale | `terms.attachToReceipt` | `api.json` |
| How long orders, consent records and deletion records are kept | `retention` | `api.json` |
| How long an unused session lasts | `session` | `api.json` |
| What an automated import may apply without a person | `sync.autoApply`, `sync.customerAutoApply` | `api.json` |
| Where mail is sent from, and who at the shop receives enquiries, orders and import alerts | `MAIL_*` | environment |
| Common passwords to refuse when a password is chosen | `password-blocklist.txt` | config directory |
| Whether search engines may index the shop | `SEO_INDEXABLE` | environment |
| Address and company suggestions | `SUGGESTION_SIDECAR_URL`, plus a provider container | environment |
| Nightly backups and the encrypted off-host copy | `COMPOSE_PROFILES=backup`, `BACKUP_*` | environment |
| Central logs and alerts | `GRAFANA_DOMAIN`, `MAIL_OPS_TO` | deploy workflow |

Every setting is explained in the
[configuration reference](../deployments/fixture/config/README.md). What the platform holds
about people, and which settings decide how long, is in [personal-data.md](personal-data.md):
a shop writes its privacy policy from it.

## Connecting a back office

A shop runs without one. To connect an ERP, an admin issues a machine token in the panel and
hands over the catalog, the customers or the orders, each separately. The import limits in
`api.json` decide which runs apply themselves and which wait for a person. Start with
[exchange-areas.md](exchange-areas.md), then the machine API reference for each area. The
simulated back office in [apps/erp-sim](../apps/erp-sim) is a small working client to read
alongside them.

## Upgrading

A release's version says what it asks of you
([ADR 0044](adr/0044-versioning-by-what-a-release-changes.md)). A patch fixes, a minor adds
features, and both deploy unattended. A major changes something outside the image, such as an
integration contract or a migration a person has to run, and its release notes say what to do.

Any release may also add, rename or move configuration keys. Such a release ships a map, and
`tools/migrate-config.mjs` applies it to your config directory, keeping your wording and
settings and reporting what you have to write yourself
([when a release moves keys](../deployments/fixture/config/README.md#when-a-release-moves-config-keys-or-files)).
A deployment several releases behind applies each map in order.

Rolling back is deploying the earlier version again. Migrations are additive except in a major
release, so the earlier image runs against the newer schema; a major's rollback is a restore
from backup ([infra/README.md](../infra/README.md#what-a-deploy-costs-and-how-to-undo-it)).
