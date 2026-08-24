# Roadmap

Iteration plan mapping requirements (see [`requirements.md`](requirements.md)) to delivery order. This doc changes
as priorities shift; the requirements doc stays stable. Live per-iteration tracking: GitHub
Milestones (one per iteration). Release notes: GitHub Releases per semver tag.

| #   | Milestone                                                                                      | Requirements                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Static pages, compliance scaffolding, base infra (walking skeleton, CI/CD, IaC, dev+prod)      | FR-NAV-\*, NFR-LEGAL-01/02/03/05, NFR-SEC-01, NFR-SEO-03, NFR-OPS-\*                                                                 |
| 2   | Catalog display + admin login, management & sync → **tag v1.0.0**, client starts content entry | FR-CAT-01…05, FR-ADM-\*, FR-AUTH-07/08, NFR-SEC-02/03/05, NFR-SEO-01/02, NFR-LEGAL-06                                                |
| 3   | Search, listing sort & admin grid filters → **tag v1.1.0**                                     | FR-SEARCH-01…05, FR-ADM-05, NFR-SEC-07, NFR-SEO-04, NFR-OPS-05                                                                       |
| 4   | Accounts, roles & tiered pricing → **tag v1.2.0**                                              | FR-AUTH-01…06, FR-NOTIF-01/02/04, NFR-SEC-04                                                                                         |
| 5   | Units of sale, pack pricing & product publication → **tag v1.3.0**                             | FR-UNIT-01…06/08/09/10, FR-ADM-06, FR-ADM-01/05 + FR-CAT-04/05 amended                                                               |
| 6   | Attribute definitions & faceted filtering → **tag v1.4.0**                                     | FR-ATTR-01…10, FR-UNIT-11, FR-UNIT-06/09 amended, NFR-SEO-04 amended                                                                 |
| 7   | Cart & order-request checkout → **tag v1.5.0**                                                 | FR-UNIT-07, FR-UNIT-04/11 amended, FR-CART-01…04/07…11, FR-AUTH-09/10 + FR-AUTH-01 amended, FR-ACC-01, FR-NOTIF-05/06, NFR-SEC-06/08 |
| 8   | Order processing, payment & manual delivery/pickup coordination → **tag v1.6.0**               | FR-CART-05/06, FR-NOTIF-03, FR-ACC-02, NFR-LEGAL-04                                                                                  |

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
- Iterations 5–8 were re-cut from what used to be two rows ("cart & checkout", then
  "payment & delivery"). Planning the cart surfaced a question the requirements had never
  asked — whether the shop sells by the piece. It does not: products sell by piece, pack or
  box, some prices in the source system cover a pack rather than a piece, and some products
  have a minimum order quantity. That is catalog and pricing data, so it earned an iteration
  of its own (FR-UNIT-\*) **before** the cart, rather than being discovered inside it. Two
  consequences: the client can start entering packaging data one release earlier, and the
  cart is built once against a settled unit model instead of twice.
- Iteration 5 keeps packaging **out of the bulk sync** (FR-ADM-02 is deliberately not
  amended): the values are admin-entered for now. That is also why FR-ADM-06 lands here — a
  synced product arrives with a price whose basis nobody has set yet, so it must not be
  publicly visible until a human has reviewed it.
- Iteration 6 was the cart until the client asked for attribute filtering, which took the
  slot and pushed the cart and order processing down one each. The reason is the same one
  that gave the units of sale an iteration of their own: filtering changes **what content
  the client enters**, and the client is entering it now. Aligning attribute keys across
  several hundred products is far cheaper before they are typed than after, so the feature
  that constrains data entry goes first and the feature that only changes what visitors do
  waits. It also settles a question iteration 5 left open — the packaging summary and the
  minimum quantity leave the product page's attribute table here (FR-UNIT-06/09 amended)
  and come back in iteration 7 beside the add-to-cart control, where the minimum is a rule
  on an input rather than a fact about the product.
- Iteration 6 keeps attributes **outside the bulk sync**, as they already are: they are an
  admin overlay under ADR 0022, so a definition can be added without a sync run and a
  filter cannot be broken by one.
- Iteration 7 pulls **FR-CART-07** forward from the old payment row. A delivery address and a
  pickup choice are checkout, not payment; leaving them out would mean building the checkout
  form twice and an address book that omits the address most customers have. It also adds
  **FR-CART-08**, a per-product note on a cart line, for goods whose variant is stated in
  words rather than carried by a separate article.
- A client review of the ordering flow (2026-08-23) reshaped iteration 7 without moving its
  boundary. A cart line can **change its unit**, which is a conversion rather than a relabelling
  and so is spelled out in FR-CART-02, and the unit a customer chose is never normalized away.
  The **shipment estimate covers every unit**, not only whole boxes (FR-UNIT-11 amended) — the
  client wants a carton count and a weight on a piece order too, and accepts that it is
  approximate. **FR-CART-09** is new: an order names the party it is for, because a sole trader
  may buy privately and a private customer may be buying for a company, and which it is decides
  the paperwork and can decide the price. **FR-CART-10** is new too: a cart is expected to sit in
  a browser for weeks, so it says what changed while it waited. The **line note** turned out to
  describe a whole line rather than to split one (FR-CART-08 rewritten), which removes the
  identity machinery it would otherwise have needed, and it is never mandatory. Checkout is
  **one prefilled form** (ADR 0039), not a wizard: a manager reviews every order anyway, so the
  form's job is to be quick. And staff views of an order read in **basis units** (FR-UNIT-04
  amended), which is what the source system prices in.
- Address entry is the one field ADR 0039's prefill cannot help with, and it is also what decides
  a delivery rule, so **FR-CART-11** (suggestion behind a per-deployment port) and the
  free-delivery minimum in FR-CART-07 land together rather than a release apart: a threshold
  keyed off a postal code is only as reliable as the postal code, and suggestion is what makes
  that field trustworthy. Both stay advisory — no order is refused for missing a threshold, and
  no delivery price is computed (ADR 0040).
- Iteration 8 is what a manager does with an order once it exists — status transitions, the
  payment PDF, card payment, the order PDF. Splitting it from iteration 7 lets the order
  schema be reviewed before a processing workflow is built on top of it.
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
