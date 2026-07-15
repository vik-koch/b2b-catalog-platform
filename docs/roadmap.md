# Roadmap

Iteration plan mapping requirements (see [`requirements.md`](requirements.md)) to delivery order. This doc changes
as priorities shift; the requirements doc stays stable. Live per-iteration tracking: GitHub
Milestones (one per iteration). Release notes: GitHub Releases per semver tag.

| # | Milestone | Requirements |
|---|---|---|
| 1 | Static pages, compliance scaffolding, base infra (walking skeleton, CI/CD, IaC, dev+prod) | FR-NAV-\*, NFR-LEGAL-01/02/03/05, NFR-SEC-01, NFR-SEO-03, NFR-OPS-\* |
| 2 | Catalog display + admin login, management & sync → **tag v1.0.0**, client starts content entry | FR-CAT-01…05, FR-ADM-\*, FR-AUTH-07, NFR-SEC-02/03/05, NFR-SEO-01/02 |
| 3 | Search | FR-SEARCH-01…03 |
| 4 | Accounts, roles & tiered pricing | FR-AUTH-01…06, FR-NOTIF-01/02/04, NFR-SEC-04 |
| 5 | Cart & order-request checkout | FR-CART-01…04, FR-NOTIF-03/05, FR-ACC-\*, NFR-SEC-06 |
| 6 | Payment & manual delivery/pickup coordination | FR-CART-05/06/07, NFR-LEGAL-04 |

Notes:
- Iteration 2 ships the minimal admin login (FR-AUTH-07: seeded admin account, config-provided
  credentials) with rate limiting, password hashing, and payload validation (NFR-SEC-02/03/05)
  pulled forward — the admin panel cannot be public or unprotected during real content entry.
  Full account management lands in iteration 4.
- Iteration 2 prices come from the default (lowest-tier) price list only — one price per
  product. Tier→price-list resolution (FR-AUTH-05) lands in iteration 4.
- Client reviews v1.0.0 on the **dev** environment only. Frame that feedback round as
  catalog/content/UX review — no accounts or cart exist yet, and prices are default-list only.
- SSR and sitemap (NFR-SEO-01/02) are built in iteration 2, but the dev environment stays
  `noindex`; indexing is enabled only when prod goes live.

## Explicitly out of scope for now
- UI localization / i18n — both deployments are single-locale; revisit only if a deployment ever needs a second language
- Product availability/stock status
- Automated delivery/courier API integration
- Live/automatic sync from the legacy source system