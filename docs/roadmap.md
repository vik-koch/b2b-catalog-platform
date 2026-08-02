# Roadmap

Iteration plan mapping requirements (see [`requirements.md`](requirements.md)) to delivery order. This doc changes
as priorities shift; the requirements doc stays stable. Live per-iteration tracking: GitHub
Milestones (one per iteration). Release notes: GitHub Releases per semver tag.

| #   | Milestone                                                                                      | Requirements                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Static pages, compliance scaffolding, base infra (walking skeleton, CI/CD, IaC, dev+prod)      | FR-NAV-\*, NFR-LEGAL-01/02/03/05, NFR-SEC-01, NFR-SEO-03, NFR-OPS-\*                  |
| 2   | Catalog display + admin login, management & sync → **tag v1.0.0**, client starts content entry | FR-CAT-01…05, FR-ADM-\*, FR-AUTH-07/08, NFR-SEC-02/03/05, NFR-SEO-01/02, NFR-LEGAL-06 |
| 3   | Search, listing sort & admin grid filters → **tag v1.1.0**                                     | FR-SEARCH-01…05, FR-ADM-05, NFR-SEC-07, NFR-SEO-04, NFR-OPS-05                        |
| 4   | Accounts, roles & tiered pricing                                                               | FR-AUTH-01…06, FR-NOTIF-01/02/04, NFR-SEC-04                                          |
| 5   | Cart & order-request checkout                                                                  | FR-CART-01…04, FR-NOTIF-03/05, FR-ACC-\*, NFR-SEC-06                                  |
| 6   | Payment & manual delivery/pickup coordination                                                  | FR-CART-05/06/07, NFR-LEGAL-04                                                        |

Notes:

- Iteration 2 ships the minimal admin login (FR-AUTH-07: seeded admin account, config-provided
  credentials) with rate limiting, password hashing, and payload validation (NFR-SEC-02/03/05)
  pulled forward — the admin panel cannot be public or unprotected during real content entry.
  Self-service password change (FR-AUTH-08) comes with it: the seeded password is known to
  whoever can read the deployment config, so the admin must be able — and be made — to replace
  it. Full account management lands in iteration 4.
- Iteration 2 prices come from the default (lowest-tier) price list only — one price per
  product. Tier→price-list resolution (FR-AUTH-05) lands in iteration 4.
- Iteration 3 grew past the three search requirements it started with. Search needs sort controls
  to be usable at all (FR-SEARCH-04), and building the matcher makes the admin grid's
  find-a-product problem cheap to solve at the same time (FR-ADM-05) — the client is entering
  content now and is the one feeling it. The three NFRs are the tail search drags in: a new
  unauthenticated endpoint to rate-limit, listing variants to keep out of the index, and
  zero-result queries to make visible. All additive → **v1.1.0**, no contract breakage.
- Client reviews v1.0.0 on the **dev** environment only. Frame that feedback round as
  catalog/content/UX review — no accounts or cart exist yet, and prices are default-list only.
- SSR and sitemap (NFR-SEO-01/02) are built in iteration 2, but the dev environment stays
  `noindex`; indexing is enabled only when prod goes live.
- Maintenance mode (FR-ADM-04) is the go-live gate. A deployment boots with it **off** (the
  default runtime setting); the admin logs in — the login route stays reachable — flips it
  **on** to populate catalog and content behind a 503'd storefront via FR-ADM-01-03, then flips
  it **off** to launch. The brief window before it is first switched on is harmless: prod DNS
  is not public and dev stays `noindex` until launch.

## Explicitly out of scope for now

- UI localization / i18n — both deployments are single-locale; revisit only if a deployment ever needs a second language
- Product availability/stock status
- Automated delivery/courier API integration
- Live/automatic sync from the legacy source system
