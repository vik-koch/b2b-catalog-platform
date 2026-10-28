# Architecture decision records

One record per decision that shapes the code, in the order the decisions were taken. Each
states the situation that forced it, the alternatives considered, what was chosen and what the
choice costs. [docs/architecture.md](../architecture.md) shows how they fit together.

**Writing one.** Copy [template.md](template.md) to the next number. A record whose decision
has not shipped yet is rewritten in place. One that has shipped keeps its original text and
gains an `## Amendment — DATE (vX.Y.Z)` section, because the earlier state really existed. A
decision that replaces another says `supersedes NNNN`, and the older one is marked
`superseded by NNNN`.

The index below is generated from each record's heading and status line
(`node tools/generate-adr-index.mjs`).

<!-- generated:adr-index -->
<!-- prettier-ignore -->
| ADR | Decision | Date | Status |
| --- | --- | --- | --- |
| 0001 | [Build a custom application instead of adopting a shop platform](0001-build-custom-instead-of-shop-platform.md) | 2026-07-17 | accepted |
| 0002 | [Angular, NestJS and PostgreSQL as the stack](0002-angular-nestjs-postgresql-stack.md) | 2026-07-17 | accepted |
| 0003 | [One Nx monorepo for both apps and shared code](0003-nx-monorepo.md) | 2026-07-17 | accepted |
| 0004 | [Deploy with Docker Compose on a single VM](0004-docker-compose-on-a-vm.md) | 2026-07-17 | accepted |
| 0005 | [One shared Traefik reverse proxy per VM](0005-shared-traefik-reverse-proxy.md) | 2026-07-17 | accepted |
| 0006 | [Ephemeral Terraform demo, manually created long-lived VM](0006-ephemeral-demo-and-manual-pet-vm.md) | 2026-07-17 | accepted |
| 0007 | [Build once, promote by digest, multi-arch images](0007-build-once-promote-multi-arch-images.md) | 2026-07-17 | accepted |
| 0008 | [Tailwind with owned UI primitives and runtime theme tokens](0008-tailwind-owned-primitives-runtime-theming.md) | 2026-07-19 | accepted, amended |
| 0009 | [Deliver deployment config and UI text in the served document](0009-deployment-config-and-text-via-transfer-state.md) | 2026-07-20 | accepted, amended |
| 0010 | [Embed maps as iframe URLs only, behind a per-deployment provider seam](0010-map-embedding-iframe-url-only.md) | 2026-07-20 | accepted |
| 0011 | [Cookie consent: one deployment flag, a binary choice, no categories](0011-cookie-consent-mechanism.md) | 2026-07-21 | accepted |
| 0012 | [Apply migrations via a one-shot container; run them from the app bundle](0012-migrations-one-shot-container.md) | 2026-07-21 | accepted, amended |
| 0013 | [Send all email through a Mailer port with an SMTP adapter](0013-email-via-mailer-port-smtp-adapter.md) | 2026-07-21 | accepted |
| 0014 | [Assemble email bodies from a per-feature text file now, defer a configurable HTML template](0014-configurable-email-templates.md) | 2026-07-22 | superseded by [0033](0033-branded-email-layout-and-templates.md) |
| 0015 | [Rate-limit abuse-prone endpoints with @nestjs/throttler and a honeypot](0015-rate-limit-throttler-honeypot.md) | 2026-07-22 | accepted |
| 0016 | [Central application logs via Grafana Loki](0016-central-logs-via-grafana-loki.md) | 2026-07-22 | accepted, amended |
| 0017 | [Scheduled database backups via a compose sidecar](0017-scheduled-database-backups.md) | 2026-07-22 | accepted |
| 0018 | [One mounted config directory carries the whole per-deployment config](0018-unified-deployment-config-directory.md) | 2026-07-23 | accepted, amended |
| 0019 | [Session auth: argon2id + JWT-in-httpOnly-cookie, DB as authorization source](0019-session-auth-argon2-jwt-cookie.md) | 2026-07-25 | accepted, amended |
| 0020 | [Store rich text as sanitized HTML, edit it with a schema-constrained Tiptap](0020-rich-text-as-sanitized-html-tiptap.md) | 2026-07-25 | accepted, amended |
| 0021 | [Serve editor images from a media store port, never inline or hotlinked](0021-media-uploads-behind-a-store-port.md) | 2026-07-27 | accepted |
| 0022 | [Model the catalog with file-owned fields plus an admin overlay, decoupled from both the import format and the read API](0022-catalog-storage-model-and-import-read-decoupling.md) | 2026-07-28 | accepted, amended |
| 0023 | [Maintenance mode is a DB-persisted flag enforced as a server-side 503 gate](0023-maintenance-mode-db-flag-503-gate.md) | 2026-07-28 | accepted, amended |
| 0024 | [Serve sitemap/robots from the SSR tier and gate indexing with a per-deployment env flag](0024-seo-sitemap-robots-and-environment-indexability.md) | 2026-07-28 | accepted, amended |
| 0025 | [Edit the catalog in place, with soft-deleted products and guarded categories](0025-catalog-editing-model-and-affordances.md) | 2026-07-30 | accepted, amended |
| 0026 | [Define a stable sync row contract with per-run intent, applied through a staged preview](0026-catalog-bulk-sync-import-contract-and-run-model.md) | 2026-07-30 | accepted, amended |
| 0027 | [Keep a fixed page set, make publication and placement per-deployment](0027-fixed-page-set-with-per-deployment-publication.md) | 2026-07-31 | accepted, amended |
| 0028 | [Back up the media volume, and give the operator scripted off-box copies and restore](0028-media-backups-and-operator-restore.md) | 2026-07-31 | accepted, amended |
| 0029 | [Attribute bundled dependencies from the build's own notice file, and gate production licenses in CI](0029-third-party-license-attribution-and-policy-gate.md) | 2026-08-01 | accepted |
| 0030 | [Search products with Postgres full-text search scored together with trigram word similarity](0030-product-search-postgres-fts-and-trigram.md) | 2026-08-01 | accepted |
| 0031 | [Customer tiers are database rows; a product's non-default prices live in a side table](0031-customer-tiers-and-price-lists.md) | 2026-08-04 | accepted, amended |
| 0032 | [Customer accounts are staff-approved, and self-deletion anonymizes](0032-account-lifecycle-and-staff-approval.md) | 2026-08-06 | accepted, amended |
| 0033 | [One branded layout, one template per message, wording in config](0033-branded-email-layout-and-templates.md) | 2026-08-06 | accepted, supersedes [0014](0014-configurable-email-templates.md), amended |
| 0034 | [Nobody is sent a password: single-use links, length over composition](0034-password-links-and-password-rules.md) | 2026-08-06 | accepted |
| 0035 | [Sell in piece/pack/box, with a staff-only price basis](0035-units-of-sale-and-price-basis.md) | 2026-08-16 | partly superseded by [0058](0058-the-price-is-per-piece.md), amended |
| 0036 | [A product reaches the storefront only when an admin publishes it](0036-product-publication-gate.md) | 2026-08-16 | accepted, amended |
| 0037 | [Store product attributes as rows, and declare the filterable ones](0037-product-attributes-as-rows.md) | 2026-08-18 | accepted, amended |
| 0038 | [Hold the cart in the browser, and store an order as a self-contained snapshot](0038-browser-held-cart-and-order-snapshots.md) | 2026-08-23 | partly superseded by [0042](0042-a-unit-is-a-lens-on-a-piece-count.md), [0058](0058-the-price-is-per-piece.md), amended |
| 0039 | [One prefilled checkout form, and the party it is invoiced to](0039-one-checkout-form-and-the-ordering-party.md) | 2026-08-23 | accepted, amended |
| 0040 | [Suggest addresses through a port, and match them against configured delivery zones](0040-address-suggestion-and-delivery-zone-rules.md) | 2026-08-23 | accepted |
| 0041 | [Suggest a company through the same sidecar, and never let it decide](0041-company-identification-and-party-suggestion.md) | 2026-08-24 | accepted |
| 0042 | [A unit is a lens on an integer piece count](0042-a-unit-is-a-lens-on-a-piece-count.md) | 2026-08-26 | accepted, amended |
| 0043 | [Move contracts to oRPC, and send the browser routes rather than schemas](0043-contract-layer-and-what-the-browser-downloads.md) | 2026-09-03 | accepted, amended |
| 0044 | [Version releases by blast radius, then by scope](0044-versioning-by-what-a-release-changes.md) | 2026-09-03 | accepted |
| 0045 | [Derive availability from a stock piece count, and sort by it everywhere](0045-availability-as-a-derived-state-of-a-piece-count.md) | 2026-09-03 | accepted |
| 0046 | [Work awaiting attention is a query, not a table](0046-work-awaiting-attention-is-a-query-not-a-table.md) | 2026-09-03 | accepted |
| 0047 | [Pair products mutually, and check the cart rather than the add](0047-pair-products-mutually-and-check-the-cart.md) | 2026-09-04 | accepted |
| 0048 | [Store product documents unmodified, beside the media store](0048-store-product-documents-unmodified.md) | 2026-09-05 | accepted |
| 0049 | [Documents expire; they are not superseded](0049-documents-expire-not-superseded.md) | 2026-09-05 | accepted |
| 0050 | [Track an order's lifecycle and its payment as two facts](0050-order-lifecycle-and-payment-as-separate-facts.md) | 2026-09-06 | accepted |
| 0051 | [An order is a thread of versions](0051-an-order-is-a-thread-of-versions.md) | 2026-09-08 | accepted |
| 0052 | [Generate an order's documents, and let a supplied file replace them](0052-order-documents-generated-or-supplied.md) | 2026-09-09 | accepted |
| 0053 | [Authenticate automated clients with scoped, hashed machine tokens](0053-machine-tokens-for-automated-clients.md) | 2026-09-10 | accepted, amended |
| 0054 | [Put the source-system exchange behind an inbound adapter](0054-source-system-exchange-as-an-inbound-adapter.md) | 2026-09-10 | accepted |
| 0055 | [Let an automated run apply itself only within a declared policy](0055-when-an-automated-run-applies-itself.md) | 2026-09-10 | accepted |
| 0056 | [Make external ownership an operator switch with an area, not two toggles](0056-an-external-owner-makes-fields-read-only.md) | 2026-09-10 | accepted, amended |
| 0057 | [Tell the shop about an exchange on a change of state, not on a run](0057-exchange-notifications-are-state-changes.md) | 2026-09-11 | accepted, amended |
| 0058 | [Price a product per piece, not per a stored basis](0058-the-price-is-per-piece.md) | 2026-09-11 | accepted |
| 0059 | [A price belongs to a (product, price list) pair](0059-a-price-belongs-to-a-product-and-a-price-list.md) | 2026-09-11 | accepted |
| 0060 | [Give a run an area, not a second set of machinery](0060-the-exchange-is-area-scoped.md) | 2026-09-16 | accepted, amended |
| 0061 | [The exchange issues no credential and never deletes](0061-the-exchange-issues-no-credential-and-never-deletes.md) | 2026-09-16 | accepted |
| 0062 | [An order write-back is one version, applied as it arrives](0062-an-order-write-back-is-one-version.md) | 2026-09-18 | accepted, amended |
| 0063 | [Show a category as a chip, and retire its picture](0063-a-category-is-a-chip.md) | 2026-09-21 | accepted |
| 0064 | [Name a product's variants on its pictures, not as articles](0064-a-variant-is-a-name-on-a-picture.md) | 2026-09-29 | accepted |
| 0065 | [State the tax basis, never the tax](0065-state-the-tax-basis-never-the-tax.md) | 2026-10-06 | accepted |
| 0066 | [Confirm a sign-in through the phone](0066-confirm-a-sign-in-through-the-phone.md) | 2026-10-07 | accepted |
| 0067 | [Send each night's backup off the host as an encrypted pair, to storage the host cannot erase](0067-backups-leave-the-host-as-an-encrypted-pair.md) | 2026-10-09 | accepted |
| 0068 | [Simulate the demo shop's back office as a client of the machine API](0068-simulate-the-demo-back-office-through-the-machine-api.md) | 2026-10-23 | accepted |
| 0069 | [Split the web app, its texts and the contracts by audience](0069-split-web-texts-and-contracts-by-audience.md) | 2026-10-25 | accepted |
| 0070 | [Build every form on Signal Forms, around one field shell](0070-build-forms-on-signal-forms.md) | 2026-10-26 | accepted |
| 0071 | [Keep the UI building blocks in a library apart from the app](0071-a-ui-library-apart-from-the-app.md) | 2026-10-27 | accepted |
| 0072 | [Keep the web app's views apart from what loads and changes data](0072-keep-views-apart-from-what-loads-data.md) | 2026-10-28 | accepted |

<!-- /generated:adr-index -->
