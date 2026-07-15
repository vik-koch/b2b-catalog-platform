# Project Brief

## What this is
`b2b-catalog-platform` — a B2B catalog/ordering platform serving two purposes:
1. Real production deployment for an actual client: a small retail/wholesale business,
   multi-decade history, several-hundred-SKU catalog, manual/negotiated pricing for repeat
   customers.
2. Public open-source portfolio piece demonstrating requirements engineering, documented
   architecture decisions, disciplined AI-assisted development, and phased backward-compatible
   delivery. Target audience: freelance clients in the EU. Public repo uses a fictional demo shop
   persona for demonstration purposes. All client specifics live only in the private deployment repo.

Docs: `docs/requirements.md` (stable "what", FR-\*/NFR-\* IDs) · `docs/roadmap.md` (changing
"when", iteration→requirement mapping) · `docs/adr/NNNN-*.md` (decisions). Issue tracking:
GitHub Milestones per iteration; release notes: GitHub Releases per tag.

## Architecture decisions (right-sizing is the recurring theme)
- Angular + NestJS + PostgreSQL, custom-built. TypeScript throughout.
- Search: Postgres FTS (`tsvector` + `pg_trgm`), NOT Elasticsearch.
- Maps: configurable iframe embed URL per deployment.
- Auth: app-issued JWT (httpOnly cookie) + NestJS AuthGuard/RolesGuard, NOT OAuth2, NOT OPA.
- Validation: global ValidationPipe, class-validator DTOs, whitelist + forbidNonWhitelisted.
- Rendering: Angular SSR (one running Node process) serves all crawler-visible routes —
  catalog/product and static pages alike. Static-page HTML is cached per slug, invalidated
  on admin save. No build-time prerendering of DB-backed content.
- Infra: Docker + Compose + Terraform + cloud-init, NOT Kubernetes/Helm. Terraform provisions
  VM/network/firewall only; cloud-init installs Docker; CI/CD deploys containers.
- One shared Traefik reverse proxy: TLS (Let's Encrypt), host-based dev/prod routing on
  one VM (no port juggling), rate limiting on auth endpoints. No separate API gateway.
- Region-specific integrations: ports-and-adapters — interfaces public, concrete regional
  adapters private. Private repo consumes only public artifacts for deployment.

## Hosting
- Demo: Oracle Cloud Always Free (Ampere A1, ARM64 → build `linux/arm64`). Dev + prod = two compose
  stacks, one VM, hostname-routed.
- Client deployment: provider/region documented only in the private repo. Billed and owned by
  the client, isolated from author's other infrastructure.
- Walking skeleton first: hello-world Angular+NestJS+Postgres through the full pipeline
  before any real feature.

## Data model invariants
- **Role ≠ tier.** Role (admin/manager/user) = authorization. Customer tier = pricing group,
  independent field, only for `user` accounts, assigned on approval, invisible to the user.
  Prices resolve via tier→price-list mapping; guests see lowest-tier price.
- Single-language throughout (product content and UI), no i18n framework, no locale keys.
  Each deployment ships one locale's text; i18n is explicitly out of scope (see roadmap).
- Static page content (privacy, imprint, about, conditions) = generic `Page` entity
  (slug/title/rich-text body), admin-editable. Fixed slug set — no page create/delete.
  Navigation, header/footer, and interactive widgets (contact form, map embed) are code;
  the map embed URL and header contact info come from deployment config, not CMS content.
- Catalog sync: manual file-based, upsert by SKU, soft-delete missing, diff preview before
  commit, audit-logged. No live sync with the legacy source system.
- Account deletion anonymizes past orders, never deletes them.

## Workflow conventions
- Trunk-based: `main` only, branch protection (PR + green CI required), short-lived
  `feat/123-*` / `fix/123-*` branches. Issue titles carry requirement IDs: `[FR-CAT-04] ...`.
- Strict semver; breaking changes avoided — new features are minor versions. API contracts
  (esp. the sync import shape) stay stable; internals may change freely.
- Deploys: merge to `main` → auto-deploy `dev` environment. Semver tag is used for deploy to `prod`.
