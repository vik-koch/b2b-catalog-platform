# Roadmap

Iteration plan mapping requirements (see [`requirements.md`](requirements.md)) to delivery order. This doc changes
as priorities shift; the requirements doc stays stable. Live per-iteration tracking: GitHub
Milestones (one per iteration). Release notes: GitHub Releases per semver tag.

| #   | Milestone                                                                                      | Requirements                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Static pages, compliance scaffolding, base infra (walking skeleton, CI/CD, IaC, dev+prod)      | FR-NAV-\*, NFR-LEGAL-01/02/03/05, NFR-SEC-01, NFR-SEO-03, NFR-OPS-\*                                                                                                                |
| 2   | Catalog display + admin login, management & sync → **tag v1.0.0**, client starts content entry | FR-CAT-01…05, FR-ADM-\*, FR-AUTH-07/08, NFR-SEC-02/03/05, NFR-SEO-01/02, NFR-LEGAL-06                                                                                               |
| 3   | Search, listing sort & admin grid filters → **tag v1.1.0**                                     | FR-SEARCH-01…05, FR-ADM-05, NFR-SEC-07, NFR-SEO-04, NFR-OPS-05                                                                                                                      |
| 4   | Accounts, roles & tiered pricing → **tag v1.2.0**                                              | FR-AUTH-01…06, FR-NOTIF-01/02/04, NFR-SEC-04                                                                                                                                        |
| 5   | Units of sale, pack pricing & product publication → **tag v1.3.0**                             | FR-UNIT-01…06/08/09/10, FR-ADM-06, FR-ADM-01/05 + FR-CAT-04/05 amended                                                                                                              |
| 6   | Attribute definitions & faceted filtering → **tag v1.4.0**                                     | FR-ATTR-01…10, FR-UNIT-11, FR-UNIT-06/09 amended, NFR-SEO-04 amended                                                                                                                |
| 7   | Cart & order-request checkout → **tag v1.5.0**                                                 | FR-UNIT-07, FR-UNIT-01/03/04/10/11 amended, FR-CART-01…04/07…11 (02 rewritten), FR-ATTR-11, FR-CAT-06, FR-AUTH-09/10 + FR-AUTH-01 amended, FR-ACC-01, FR-NOTIF-05/06, NFR-SEC-06/08 |
| 8   | Stock availability & work-awaiting indicators → **tag v1.6.0**                                 | FR-STOCK-01…05, FR-WORK-01…04, FR-ADM-02/05 + FR-SEARCH-04 + FR-CAT-04/05 + FR-CART-02 amended                                                                                      |
| 9   | Sold-together sets → **tag v1.7.0**                                                            | FR-SET-01…05                                                                                                                                                                        |
| 10  | Product documents & certificates → **tag v1.8.0**                                              | FR-DOC-01…04, FR-CAT-05 amended                                                                                                                                                     |
| 11  | Order processing, payment state & order documents → **tag v1.9.0**                             | FR-ORD-01…06, FR-CART-05 + FR-CART-06 amended, FR-NOTIF-03, FR-ACC-02, FR-WORK-04 (customer half), NFR-LEGAL-04                                                                     |
| 12  | Two-way sync with the source system → **tag v1.10.0**                                          | FR-ADM-07/08/09, NFR-SEC-09, NFR-OPS-06/07, FR-ADM-02 amended                                                                                                                       |
| 13  | Online card payment → **tag v1.11.0**                                                          | FR-CART-04/06 amended                                                                                                                                                               |

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
- Iterations 5–7, and what is now iteration 11, were re-cut from what used to be two rows ("cart & checkout", then
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
  ⚠ Both halves of that sentence were reversed within the iteration — see the note below.
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
- Late in iteration 7 the units model was re-cut twice (issue #141). `minPieceQty` had been
  serving as both the minimum and the increment, which made a shop that will not ship fewer
  than 24 also refuse to sell 30: **the pack is now the increment and the minimum only a
  floor** (FR-UNIT-03 amended, ADR 0035 amended). That exposed the deeper framing problem —
  a unit was a quantity dimension, so two packs could not be _shown_ as boxes without becoming
  a whole box, and FR-CART-02 had grown a confirmation prompt to cover it. **A unit is now a
  lens on an integer piece count** (FR-UNIT-01/07/10 amended, FR-CART-02 rewritten, ADR 0042,
  superseding part of ADR 0038): the quantity is always pieces, the unit only decides how it
  reads, and a line of two packs of a ten-pack box reads 0.2 bx. It was affordable because
  v1.5.0 was still untagged and the cart and order contracts had never shipped.

- A review of the checkout form (2026-08-27) reversed the central decision of ADR 0039
  before it shipped. The invoiced party had been a property of the **address** — choosing
  a row named the party — which fails the moment a customer is invoiced to one party at
  another's saved address: the screen contradicts itself, and "save this address" would
  file an identity nobody typed. The party is now **a field of the order** (FR-CART-09
  reworded), in three answers — the account's own, another person, another company — and
  `addresses` lost `companyName`, `companyId` and `phone`: registration already collects a
  company's name (which is the gap ADR 0039 was filling), and the order already carries
  the number a manager rings. Bank transfer therefore needs a **company** party
  (FR-CART-04 reworded). ADR 0039 was rewritten rather than amended — it had never
  shipped, so its amendment trail would have been a record of drafting — and iteration 7's
  unreleased migrations were squashed into one.
- Two requirements outside the cart landed in iteration 7 because the cart is what
  exposed them. **FR-CAT-06** is the card/row choice: a buying control on a listing tile
  makes a dense row worth having, and a shop ordering from a familiar catalog scans rows
  faster than cards. **FR-ATTR-11** lets a category declare which filterable attributes its
  listing offers and in what order (ADR 0037 amended) — declaring an attribute filterable
  catalog-wide had meant every listing that carried it offered it, which is right for a
  category whose products share a vocabulary and wrong for one that does not. Both are
  additive; neither changes what the client has already entered.
- A first pass on the real deployment (2026-08-29) found the checkout asking
  for things that locale does not have. **Whether an order carries an invoice address
  is now deployment config** (`billingAddressEnabled`, FR-CART-07 reworded, ADR 0039
  amended); off, a delivery gives one address and a collected order none, and the
  order's `billing*` columns are nullable rather than filled with blanks. **Cash is no
  longer offered for a company** (FR-CART-04 reworded) — the mirror of the rule that
  already made bank transfer company-only. And the **preferred date** offers working
  days from the next one onwards; the stricter lead times the shop actually keeps
  (an order placed at a weekend is ready on the Tuesday) are deliberately not modelled
  yet, and neither is a holiday calendar.
- Iterations 8–10 were inserted ahead of order processing (2026-09-03), which moved from
  row 8 to row 11. All three change **what the client enters into the catalog**, and the
  client is still entering it — the same argument that gave units of sale and attribute
  filtering their own iterations. They are three iterations rather than one because each is
  the size of iteration 5 or 6 on its own, and because bundling them would mean building the
  cart's validation, the buying controls and the admin grid against three unsettled models at
  once. They are deliberately small after iteration 7, which was not.
- Iteration 8 sequences first because it is the only one of the three that needs **no data
  entry**: stock arrives from the sync, so it can ship while the client is still typing
  packaging and attributes. Sets and documents are entered by hand, so the sooner each ships
  the sooner that entry can start — which is also why neither waits for order processing.
- The **work-awaiting indicators** (FR-WORK-\*) ride in iteration 8 rather than with order
  processing, where they were first proposed. Three consumers already exist — registrations
  awaiting approval since iteration 4, products awaiting publication since 5, orders awaiting
  payment since 7 — so the mechanism has customers the day it ships, and each later iteration
  registers a count instead of retrofitting one into a finished screen. Nothing is
  acknowledged and no table records that it was: every count is a query over state that is
  already there, so it appears when the work does and clears when the work is done (ADR 0046).
  The customer half of FR-WORK-04 ships with **no source yet**: an order is only ever written
  in the one state that waits on the shop, and the states that wait on a customer arrive with
  order processing in iteration 11. Their marker therefore stays dark until then — which is
  the honest reading of "a count clears when the work is done", since nothing today records
  that a customer has done anything for it to clear on.
- Iteration 9 stores a set as **undirected edges between two products** rather than as a named
  group: the client's own case is a cup paired with two lids, where each lid is sold with the
  cup and not with the other, which no partition of the catalog expresses (ADR 0047). Pairings
  are entered on the product form and saved with it, from either side; a bulk sync neither
  creates nor clears them, so the client can start pairing before the automated feed exists.
  The cart's check **allocates** cover rather than summing it: two products sharing one
  counterpart cannot both be covered by the same pieces, which is a bipartite matching and not
  an addition. An unsatisfied cart is advisory, with `catalog.pairingsEnforced` for a
  deployment that wants it refused — the API applies the flag too, so it is a rule and not a
  disabled button.
- Iteration 10 keeps a document's **file, dates and product links on one row that is edited in
  place**: replacing the file is how a re-issued certificate supersedes the one before it, so
  there is no supersession chain and no version history to inherit the links that were entered
  by hand (ADR 0049). Expiry only hides — an expired document leaves the storefront and stays
  in the admin list, marked, until somebody replaces or deletes it, because an auto-deleted row
  would clear the warning without the certificate being renewed. Expiring (within a fixed
  thirty days) and expired are counted as **one figure of work**, since a document crosses from
  one to the other with nobody touching it. The bytes are stored **unmodified** beside the
  media store rather than through it: the image pipeline re-encodes, and a re-encoded
  certificate is not one (ADR 0048).
- Iteration 11 is what a manager does with an order once it exists. Its shape came out of a
  planning round (2026-09-06) that asked what a semi-automated shop actually does, and settled
  three things. **An order's lifecycle and its payment are two facts, not one chain** (ADR 0050):
  cash on delivery is paid after the goods are handed over, so any single status running
  "awaiting payment → paid → ready" is wrong for a third of orders, and encoding the exception
  produces a state per payment method. "Ready for pickup" and "handed over for delivery" are one
  state read two ways, the same lens trick as ADR 0042. **Acceptance has two shapes** — as
  submitted, or adjusted after a phone call — and an adjustment writes a **new snapshot rather
  than editing the old one** (ADR 0051), because the reference was quoted on that call and the
  mailed link has to keep working; the customer's agreement happens on the phone, so the platform
  records it rather than asking for it, and an adjusted order re-opens the customer's cancel
  window. **Documents are generated but replaceable** (ADR 0052): a deployment whose back-office
  already produces the real paperwork supplies that file, and the generated summary is what a
  deployment without one gets. Transitions are written as service operations with the role table
  stated once, which is the only thing iteration 11 owes iteration 12.
- Iteration 12 is a **two-way** exchange, not the one-way import it was first written as. The
  return direction is the point: a manager should be able to work an order entirely in the shop's
  own system, with the platform keeping the customer's view, the notifications the source system
  has no way to send, and the catalog layer that system does not hold at all — descriptions,
  attributes, search, documents, pairings. That is where the platform earns its place in a
  deployment that already has a back-office, and it is why the manual mode built since iteration 1
  is not a demo affordance: it is the mode the shop falls back to when the exchange breaks
  (FR-ORD-06, an operator switch in the admin panel rather than a config key, so recovery does not
  need a deploy). Three rules were agreed in advance: **ownership, not conflict resolution** — the
  platform records what the customer submitted, the source system owns processing once an order has
  been exported, and nothing is merged; **the platform's status vocabulary stays coarse and the
  adapter maps onto it**, collapsing however many intermediate steps the source system moves an
  order through into the one transition a customer should read; and **updates are idempotent and
  forward-only**, since a polling adapter will re-send and FR-NOTIF-03 mails every status change.
  The adapter is a private sidecar speaking the public contract, the third such container after
  the address suggester and the payment one; the format is not named here, for the same reason the
  suggestion provider is not. The manual upload is **not** retired behind a flag when the automated
  feed exists: it is the operator's fallback when the feed breaks or a run needs correcting by hand.
  Two operability requirements ride along because this is the release that makes them urgent —
  NFR-OPS-06 (what a deploy costs in downtime, how to see it failed, how to roll back) and
  NFR-OPS-07 (what a half-finished sync leaves behind).
- Iteration 13 is online card payment, deferred from 11 (2026-09-06). It is blocked on something
  that cannot be built: a merchant account the shop does not yet have. It is also the least urgent
  of the three — nothing about the current flow needs it, since a card payment arranged with the
  manager is already a recorded method — and the most speculative, since the provider is unchosen.
  Sequencing it after the source-system exchange means it is designed against a live order flow
  with real orders in it. `card-later` is therefore **not** renamed in iteration 11: it accurately
  names an offline arrangement, and an online provider adds a second method beside it rather than
  redefining the first.
- Still open, to be decided before their iteration rather than now: whether audit records and usage
  metrics (page and product views, search-to-order funnels) are worth persisting beyond the log
  aggregation NFR-OPS-03/05 already provide; and a security assessment pass across the whole
  feature surface once the machine endpoints exist, which is a release activity rather than a
  requirement.
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
- Automated delivery/courier API integration
- Live/automatic sync from the legacy source system — moved into scope as iteration 12
  (FR-ADM-07); what stays out is a live two-way integration
