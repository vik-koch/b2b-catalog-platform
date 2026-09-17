# Roadmap

Iteration plan mapping requirements (see [`requirements.md`](requirements.md)) to delivery order. This doc changes
as priorities shift; the requirements doc stays stable. Live per-iteration tracking: GitHub
Milestones (one per iteration). Release notes: GitHub Releases per semver tag.

| # / tag           | Milestone | Delivers | Amends |
| :---------------: | --------- | -------- | ------ |
| 1<br>`v0.1.0` | Static pages, compliance scaffolding, base infra (walking skeleton, CI/CD, IaC, dev+prod) | [FR-NAV-01](requirements.md#fr-nav-01)/[02](requirements.md#fr-nav-02)/[03](requirements.md#fr-nav-03)/[04](requirements.md#fr-nav-04)/[05](requirements.md#fr-nav-05)/[06](requirements.md#fr-nav-06),<br>[NFR-LEGAL-01](requirements.md#nfr-legal-01)/[02](requirements.md#nfr-legal-02)/[03](requirements.md#nfr-legal-03)/[05](requirements.md#nfr-legal-05),<br>[NFR-SEC-01](requirements.md#nfr-sec-01),<br>[NFR-SEO-03](requirements.md#nfr-seo-03),<br>[NFR-OPS-01](requirements.md#nfr-ops-01)/[02](requirements.md#nfr-ops-02)/[03](requirements.md#nfr-ops-03)/[04](requirements.md#nfr-ops-04) | — |
| 2<br>`v1.0.0` | Catalog display + admin login, management & sync; client starts content entry | [FR-CAT-01](requirements.md#fr-cat-01)/[02](requirements.md#fr-cat-02)/[03](requirements.md#fr-cat-03)/[04](requirements.md#fr-cat-04)/[05](requirements.md#fr-cat-05),<br>[FR-ADM-01](requirements.md#fr-adm-01)/[02](requirements.md#fr-adm-02)/[03](requirements.md#fr-adm-03)/[04](requirements.md#fr-adm-04),<br>[FR-AUTH-07](requirements.md#fr-auth-07)/[08](requirements.md#fr-auth-08),<br>[NFR-SEC-02](requirements.md#nfr-sec-02)/[03](requirements.md#nfr-sec-03)/[05](requirements.md#nfr-sec-05),<br>[NFR-SEO-01](requirements.md#nfr-seo-01)/[02](requirements.md#nfr-seo-02),<br>[NFR-LEGAL-06](requirements.md#nfr-legal-06) | — |
| 3<br>`v1.1.0` | Search, listing sort & admin grid filters | [FR-SEARCH-01](requirements.md#fr-search-01)/[02](requirements.md#fr-search-02)/[03](requirements.md#fr-search-03)/[04](requirements.md#fr-search-04)/[05](requirements.md#fr-search-05),<br>[FR-ADM-05](requirements.md#fr-adm-05),<br>[NFR-SEC-07](requirements.md#nfr-sec-07),<br>[NFR-SEO-04](requirements.md#nfr-seo-04),<br>[NFR-OPS-05](requirements.md#nfr-ops-05) | — |
| 4<br>`v1.2.0` | Accounts, roles & tiered pricing | [FR-AUTH-01](requirements.md#fr-auth-01)/[02](requirements.md#fr-auth-02)/[03](requirements.md#fr-auth-03)/[04](requirements.md#fr-auth-04)/[05](requirements.md#fr-auth-05)/[06](requirements.md#fr-auth-06),<br>[FR-NOTIF-01](requirements.md#fr-notif-01)/[02](requirements.md#fr-notif-02)/[04](requirements.md#fr-notif-04),<br>[NFR-SEC-04](requirements.md#nfr-sec-04) | — |
| 5<br>`v1.3.0` | Units of sale, pack pricing & product publication | [FR-UNIT-01](requirements.md#fr-unit-01)/[02](requirements.md#fr-unit-02)/[03](requirements.md#fr-unit-03)/[04](requirements.md#fr-unit-04)/[05](requirements.md#fr-unit-05)/[06](requirements.md#fr-unit-06)/[08](requirements.md#fr-unit-08)/[09](requirements.md#fr-unit-09)/[10](requirements.md#fr-unit-10),<br>[FR-ADM-06](requirements.md#fr-adm-06) | [FR-ADM-01](requirements.md#fr-adm-01)/[05](requirements.md#fr-adm-05),<br>[FR-CAT-04](requirements.md#fr-cat-04)/[05](requirements.md#fr-cat-05) |
| 6<br>`v1.4.0` | Attribute definitions & faceted filtering | [FR-ATTR-01](requirements.md#fr-attr-01)/[02](requirements.md#fr-attr-02)/[03](requirements.md#fr-attr-03)/[04](requirements.md#fr-attr-04)/[05](requirements.md#fr-attr-05)/[06](requirements.md#fr-attr-06)/[07](requirements.md#fr-attr-07)/[08](requirements.md#fr-attr-08)/[09](requirements.md#fr-attr-09)/[10](requirements.md#fr-attr-10),<br>[FR-UNIT-11](requirements.md#fr-unit-11) | [FR-UNIT-06](requirements.md#fr-unit-06)/[09](requirements.md#fr-unit-09),<br>[NFR-SEO-04](requirements.md#nfr-seo-04) |
| 7<br>`v1.5.0` | Cart & order-request checkout | [FR-UNIT-07](requirements.md#fr-unit-07),<br>[FR-CART-01](requirements.md#fr-cart-01)/[02](requirements.md#fr-cart-02)/[03](requirements.md#fr-cart-03)/[04](requirements.md#fr-cart-04)/[07](requirements.md#fr-cart-07)/[08](requirements.md#fr-cart-08)/[09](requirements.md#fr-cart-09)/[10](requirements.md#fr-cart-10)/[11](requirements.md#fr-cart-11) (02 rewritten),<br>[FR-ATTR-11](requirements.md#fr-attr-11),<br>[FR-CAT-06](requirements.md#fr-cat-06),<br>[FR-AUTH-09](requirements.md#fr-auth-09)/[10](requirements.md#fr-auth-10),<br>[FR-ACC-01](requirements.md#fr-acc-01),<br>[FR-NOTIF-05](requirements.md#fr-notif-05)/[06](requirements.md#fr-notif-06),<br>[NFR-SEC-06](requirements.md#nfr-sec-06)/[08](requirements.md#nfr-sec-08) | [FR-UNIT-01](requirements.md#fr-unit-01)/[03](requirements.md#fr-unit-03)/[04](requirements.md#fr-unit-04)/[10](requirements.md#fr-unit-10)/[11](requirements.md#fr-unit-11),<br>[FR-AUTH-01](requirements.md#fr-auth-01) |
| 8<br>`v1.6.0` | Stock availability & work-awaiting indicators | [FR-STOCK-01](requirements.md#fr-stock-01)/[02](requirements.md#fr-stock-02)/[03](requirements.md#fr-stock-03)/[04](requirements.md#fr-stock-04)/[05](requirements.md#fr-stock-05),<br>[FR-WORK-01](requirements.md#fr-work-01)/[02](requirements.md#fr-work-02)/[03](requirements.md#fr-work-03)/[04](requirements.md#fr-work-04) | [FR-ADM-02](requirements.md#fr-adm-02)/[05](requirements.md#fr-adm-05),<br>[FR-SEARCH-04](requirements.md#fr-search-04),<br>[FR-CAT-04](requirements.md#fr-cat-04)/[05](requirements.md#fr-cat-05),<br>[FR-CART-02](requirements.md#fr-cart-02) |
| 9<br>`v1.7.0` | Sold-together sets | [FR-SET-01](requirements.md#fr-set-01)/[02](requirements.md#fr-set-02)/[03](requirements.md#fr-set-03)/[04](requirements.md#fr-set-04)/[05](requirements.md#fr-set-05) | — |
| 10<br>`v1.8.0` | Product documents & certificates | [FR-DOC-01](requirements.md#fr-doc-01)/[02](requirements.md#fr-doc-02)/[03](requirements.md#fr-doc-03)/[04](requirements.md#fr-doc-04) | [FR-CAT-05](requirements.md#fr-cat-05) |
| 11<br>`v1.9.0` | Order processing, payment state & order documents | [FR-ORD-01](requirements.md#fr-ord-01)/[02](requirements.md#fr-ord-02)/[03](requirements.md#fr-ord-03)/[04](requirements.md#fr-ord-04)/[05](requirements.md#fr-ord-05),<br>[FR-CART-05](requirements.md#fr-cart-05),<br>[FR-ACC-02](requirements.md#fr-acc-02),<br>[NFR-LEGAL-04](requirements.md#nfr-legal-04),<br>[NFR-SEC-10](requirements.md#nfr-sec-10) | [FR-CART-06](requirements.md#fr-cart-06),<br>[FR-NOTIF-03](requirements.md#fr-notif-03)/[07](requirements.md#fr-notif-07)/[08](requirements.md#fr-notif-08),<br>[FR-WORK-02](requirements.md#fr-work-02)/[04](requirements.md#fr-work-04),<br>[FR-AUTH-04](requirements.md#fr-auth-04),<br>[NFR-OPS-02](requirements.md#nfr-ops-02) |
| 12<br>`v1.10.0` | Automated catalog sync from the source system | [FR-ADM-07](requirements.md#fr-adm-07)/[09](requirements.md#fr-adm-09)/[10](requirements.md#fr-adm-10),<br>[FR-NOTIF-09](requirements.md#fr-notif-09),<br>[NFR-SEC-09](requirements.md#nfr-sec-09),<br>[NFR-OPS-06](requirements.md#nfr-ops-06)/[07](requirements.md#nfr-ops-07) | [FR-ADM-02](requirements.md#fr-adm-02)/[04](requirements.md#fr-adm-04)/[06](requirements.md#fr-adm-06),<br>[FR-AUTH-05](requirements.md#fr-auth-05),<br>[FR-UNIT-04](requirements.md#fr-unit-04)/[10](requirements.md#fr-unit-10),<br>[FR-WORK-02](requirements.md#fr-work-02),<br>[FR-CAT-01](requirements.md#fr-cat-01) |
| 13<br>`v1.11.0` | Customer exchange with the source system | [FR-ADM-11](requirements.md#fr-adm-11)/[12](requirements.md#fr-adm-12)/[13](requirements.md#fr-adm-13)/[14](requirements.md#fr-adm-14)/[15](requirements.md#fr-adm-15)/[16](requirements.md#fr-adm-16)/[17](requirements.md#fr-adm-17)/[18](requirements.md#fr-adm-18),<br>[FR-AUTH-11](requirements.md#fr-auth-11),<br>[NFR-LEGAL-07](requirements.md#nfr-legal-07)/[08](requirements.md#nfr-legal-08) | [FR-ADM-07](requirements.md#fr-adm-07)/[08](requirements.md#fr-adm-08)/[09](requirements.md#fr-adm-09)/[10](requirements.md#fr-adm-10),<br>[FR-AUTH-01](requirements.md#fr-auth-01) |
| 14<br>`v1.12.0` | Order exchange with the source system | [FR-ADM-08](requirements.md#fr-adm-08) | [FR-ADM-09](requirements.md#fr-adm-09)/[10](requirements.md#fr-adm-10),<br>[FR-ORD-02](requirements.md#fr-ord-02)/[03](requirements.md#fr-ord-03) |
| 15<br>`v1.13.0` | Online card payment | — | [FR-CART-04](requirements.md#fr-cart-04)/[06](requirements.md#fr-cart-06) |

Notes:

- Iteration 2 ships the minimal admin login ([FR-AUTH-07](requirements.md#fr-auth-07): seeded admin account, config-provided
  credentials) with rate limiting, password hashing, and payload validation ([NFR-SEC-02](requirements.md#nfr-sec-02)/[03](requirements.md#nfr-sec-03)/[05](requirements.md#nfr-sec-05))
  pulled forward — the admin panel cannot be public or unprotected during real content entry.
  Self-service password change ([FR-AUTH-08](requirements.md#fr-auth-08)) comes with it: the seeded password is known to
  whoever can read the deployment config, so the admin must be able — and be made — to replace
  it. Full account management lands in iteration 4.
- Iteration 2 prices come from the default price list only — one price per
  product. Tier→price-list resolution ([FR-AUTH-05](requirements.md#fr-auth-05)) lands in iteration 4.
- Iteration 3 grew past the three search requirements it started with. Search needs sort controls
  to be usable at all ([FR-SEARCH-04](requirements.md#fr-search-04)), and building the matcher makes the admin grid's
  find-a-product problem cheap to solve at the same time ([FR-ADM-05](requirements.md#fr-adm-05)) — the client is entering
  content now and is the one feeling it. The three NFRs are the tail search drags in: a new
  unauthenticated endpoint to rate-limit, listing variants to keep out of the index, and
  zero-result queries to make visible. All additive → `v1.1.0`, no contract breakage.
- Iterations 5–7, and what is now iteration 11, were re-cut from what used to be two rows ("cart & checkout", then
  "payment & delivery"). Planning the cart surfaced a question the requirements had never
  asked — whether the shop sells by the piece. It does not: products sell by piece, pack or
  box, some prices in the source system cover a pack rather than a piece, and some products
  have a minimum order quantity. That is catalog and pricing data, so it earned an iteration
  of its own ([FR-UNIT-\*](requirements.md#fr-unit)) **before** the cart, rather than being discovered inside it. Two
  consequences: the client can start entering packaging data one release earlier, and the
  cart is built once against a settled unit model instead of twice.
- Iteration 5 keeps packaging **out of the bulk sync** ([FR-ADM-02](requirements.md#fr-adm-02) is deliberately not
  amended): the values are admin-entered for now. That is also why [FR-ADM-06](requirements.md#fr-adm-06) lands here — a
  synced product arrives with a price and a category nobody has reviewed and packaging the
  sync does not carry, so it must not be publicly visible until a human has looked at it.
- Iteration 6 was the cart until the client asked for attribute filtering, which took the
  slot and pushed the cart and order processing down one each. The reason is the same one
  that gave the units of sale an iteration of their own: filtering changes **what content
  the client enters**, and the client is entering it now. Aligning attribute keys across
  several hundred products is far cheaper before they are typed than after, so the feature
  that constrains data entry goes first and the feature that only changes what visitors do
  waits. It also settles a question iteration 5 left open — the packaging summary and the
  minimum quantity leave the product page's attribute table here ([FR-UNIT-06](requirements.md#fr-unit-06)/[09](requirements.md#fr-unit-09) amended)
  and come back in iteration 7 beside the add-to-cart control, where the minimum is a rule
  on an input rather than a fact about the product.
- Iteration 6 keeps attributes **outside the bulk sync**, as they already are: they are an
  admin overlay under ADR 0022, so a definition can be added without a sync run and a
  filter cannot be broken by one.
- Iteration 7 pulls **[FR-CART-07](requirements.md#fr-cart-07)** forward from the old payment row. A delivery address and a
  pickup choice are checkout, not payment; leaving them out would mean building the checkout
  form twice and an address book that omits the address most customers have. It also adds
  **[FR-CART-08](requirements.md#fr-cart-08)**, a per-product note on a cart line, for goods whose variant is stated in
  words rather than carried by a separate article.
- A client review of the ordering flow (2026-08-23) reshaped iteration 7 without moving its
  boundary. A cart line can **change its unit**, which is a conversion rather than a relabelling
  and so is spelled out in [FR-CART-02](requirements.md#fr-cart-02), and the unit a customer chose is never normalized away.
  ⚠ Both halves of that sentence were reversed within the iteration — see the note below.
  The **shipment estimate covers every unit**, not only whole boxes ([FR-UNIT-11](requirements.md#fr-unit-11) amended) — the
  client wants a carton count and a weight on a piece order too, and accepts that it is
  approximate. **[FR-CART-09](requirements.md#fr-cart-09)** is new: an order names the party it is for, because a sole trader
  may buy privately and a private customer may be buying for a company, and which it is decides
  the paperwork and can decide the price. **[FR-CART-10](requirements.md#fr-cart-10)** is new too: a cart is expected to sit in
  a browser for weeks, so it says what changed while it waited. The **line note** turned out to
  describe a whole line rather than to split one ([FR-CART-08](requirements.md#fr-cart-08) rewritten), which removes the
  identity machinery it would otherwise have needed, and it is never mandatory. Checkout is
  **one prefilled form** (ADR 0039), not a wizard: a manager reviews every order anyway, so the
  form's job is to be quick. And staff views of an order read in **pieces** ([FR-UNIT-04](requirements.md#fr-unit-04)
  amended), which is what the source system prices in.
- Address entry is the one field ADR 0039's prefill cannot help with, and it is also what decides
  a delivery rule, so **[FR-CART-11](requirements.md#fr-cart-11)** (suggestion behind a per-deployment port) and the
  free-delivery minimum in [FR-CART-07](requirements.md#fr-cart-07) land together rather than a release apart: a threshold
  keyed off a postal code is only as reliable as the postal code, and suggestion is what makes
  that field trustworthy. Both stay advisory — no order is refused for missing a threshold, and
  no delivery price is computed (ADR 0040).
- Late in iteration 7 the units model was re-cut twice (issue #141). `minPieceQty` had been
  serving as both the minimum and the increment, which made a shop that will not ship fewer
  than 24 also refuse to sell 30: **the pack is now the increment and the minimum only a
  floor** ([FR-UNIT-03](requirements.md#fr-unit-03) amended, ADR 0035 amended). That exposed the deeper framing problem —
  a unit was a quantity dimension, so two packs could not be _shown_ as boxes without becoming
  a whole box, and [FR-CART-02](requirements.md#fr-cart-02) had grown a confirmation prompt to cover it. **A unit is now a
  lens on an integer piece count** ([FR-UNIT-01](requirements.md#fr-unit-01)/[07](requirements.md#fr-unit-07)/[10](requirements.md#fr-unit-10) amended, [FR-CART-02](requirements.md#fr-cart-02) rewritten, ADR 0042,
  superseding part of ADR 0038): the quantity is always pieces, the unit only decides how it
  reads, and a line of two packs of a ten-pack box reads 0.2 bx. It was affordable because
  v1.5.0 was still untagged and the cart and order contracts had never shipped.

- A review of the checkout form (2026-08-27) reversed the central decision of ADR 0039
  before it shipped. The invoiced party had been a property of the **address** — choosing
  a row named the party — which fails the moment a customer is invoiced to one party at
  another's saved address: the screen contradicts itself, and "save this address" would
  file an identity nobody typed. The party is now **a field of the order** ([FR-CART-09](requirements.md#fr-cart-09)
  reworded), in three answers — the account's own, another person, another company — and
  `addresses` lost `companyName`, `companyId` and `phone`: registration already collects a
  company's name (which is the gap ADR 0039 was filling), and the order already carries
  the number a manager rings. Bank transfer therefore needs a **company** party
  ([FR-CART-04](requirements.md#fr-cart-04) reworded). ADR 0039 was rewritten rather than amended — it had never
  shipped, so its amendment trail would have been a record of drafting — and iteration 7's
  unreleased migrations were squashed into one.
- Two requirements outside the cart landed in iteration 7 because the cart is what
  exposed them. **[FR-CAT-06](requirements.md#fr-cat-06)** is the card/row choice: a buying control on a listing tile
  makes a dense row worth having, and a shop ordering from a familiar catalog scans rows
  faster than cards. **[FR-ATTR-11](requirements.md#fr-attr-11)** lets a category declare which filterable attributes its
  listing offers and in what order (ADR 0037 amended) — declaring an attribute filterable
  catalog-wide had meant every listing that carried it offered it, which is right for a
  category whose products share a vocabulary and wrong for one that does not. Both are
  additive; neither changes what the client has already entered.
- A first pass on the real deployment (2026-08-29) found the checkout asking
  for things that locale does not have. **Whether an order carries an invoice address
  is now deployment config** (`billingAddressEnabled`, [FR-CART-07](requirements.md#fr-cart-07) reworded, ADR 0039
  amended); off, a delivery gives one address and a collected order none, and the
  order's `billing*` columns are nullable rather than filled with blanks. **Cash is no
  longer offered for a company** ([FR-CART-04](requirements.md#fr-cart-04) reworded) — the mirror of the rule that
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
- The **work-awaiting indicators** ([FR-WORK-\*](requirements.md#fr-work)) ride in iteration 8 rather than with order
  processing, where they were first proposed. Three consumers already exist — registrations
  awaiting approval since iteration 4, products awaiting publication since 5, orders awaiting
  payment since 7 — so the mechanism has customers the day it ships, and each later iteration
  registers a count instead of retrofitting one into a finished screen. Nothing is
  acknowledged and no table records that it was: every count is a query over state that is
  already there, so it appears when the work does and clears when the work is done (ADR 0046).
  The customer half of [FR-WORK-04](requirements.md#fr-work-04) ships with **no source yet**: an order is only ever written
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
  state read two ways, the same lens trick as ADR 0042. **An order is a thread of versions**
  (ADR 0051): every change and every move writes one, so the thread is the order's history and any
  point in it reads back whole, and the reference quoted on the phone and the mailed link both
  survive. A change is **not** a state — a first cut had an `adjusted` acceptance beside
  `approved`, which made changing a request silently accept it and needed a special case for an
  order already packed. An adjustment may change everything the checkout asked — lines, prices, the
  price list the order is read from, fulfilment, addresses, party, payment method, contact — and
  nothing the customer wrote in their own words ([FR-ORD-03](requirements.md#fr-ord-03) amended 2026-09-08); it is offered
  wherever the order stands, since a shortage found while packing is exactly the case it exists
  for. **The customer's view of the order is a pointer; the mail is a
  decision** ([FR-NOTIF-03](requirements.md#fr-notif-03) amended 2026-09-08): the pointer follows every move, so their page
  says where the order actually is, and every move and change carries a "write to them" tick —
  offered ticked for news they have not had, clear for a step back or a second pass through a
  state they already know. A finished order reopened, corrected and finished again therefore
  mails nothing without somebody saying so, and a first cut that inferred the same thing from a
  frozen pointer was dropped: it mailed a step back with wording that announced a step forward,
  and silenced an order reopened for a real reason. What the customer was told is the newest
  version stamped as mailed, which is not the same question as which version they are on;
  telling them afterwards is still a button. Recording the money rides on the same
  confirmation, since a cash handover and the completion that records it are one event.
  Two screens follow from the thread: the one where an order is **answered**, and
  a read-only address for **one version**, which shows exactly what the customer sees with the
  facts only the shop has beside it. The cost of the thread is a copied snapshot per move — 8–10 kB
  for an ordinary five-line order walked to completion, against 2–3 kB unversioned — and the way
  out, if an integration or a hundred-line order ever makes that matter, is to stop copying items
  for a move that changed no line (ADR 0051). **Documents are generated
  but replaceable** (ADR 0052): a deployment whose back-office already produces the real paperwork
  supplies that file, and the generated summary is what a deployment without one gets. Two things
  were settled when it was built (2026-09-09). Order documents are **private** — read through the
  API under the order's own three ways in, never off the public prefix product certificates are
  served from, because the file names a customer. And supplying one **writes no version**: a file
  arriving changes nothing the order says, so telling the customer about it is its own repeatable
  act, which is also the only move available to a manager who accepted an order and then remembered
  the slip. Which version the customer sees and which they were last written to about were pulled
  apart at the same time: they are two facts, both always on the screen, and either can be put right
  afterwards — the earlier design only offered the button when it judged something unannounced, so a
  manager who cleared the tick on a move had no way back.
  That message is what the exchange will lean on, since a back-office that cannot produce its
  invoice until after it has accepted an order otherwise leaves the customer with an acceptance and
  no way to pay; where it _can_, the adapter's rule is to supply the document before the version
  that announces it, and one mail carries both. Transitions are written as service operations with
  the role table stated once, which is the only thing iteration 11 owes iteration 12.
  Three smaller things closed the iteration (2026-09-09). **The money that waits on the shop is its
  own queue**: an order handed over and not recorded as paid is the one piece of work neither axis
  names alone, so it is counted, filtered and marked amber on the row — and the rest of the payment
  column dropped to a quiet tone, because a colour spent on a fact that stays true for days stops
  meaning "act now". **Switching an account off stopped taking its password**, which deletes the
  wart ADR 0032 documented rather than describing it again: deactivation is access removed, the
  account comes back the one its owner had, and neither direction writes to them; an account that
  never chose a password comes back awaiting one, and staff send it a link — the same link the
  login form sends, from one place. And **accounts got journeys of their own**
  (`docs/account-lifecycle.md`), reusing the facility the order ones were built on, because "no mail
  was sent" is exactly the kind of claim no single-endpoint test makes.
- Iteration 12 was re-cut on 2026-09-10, before any of it was built. It had been written as a
  **two-way** exchange in one release; it is now the **catalog direction only**, and the order
  exchange is iteration 13. The reason is that the catalog direction is where the unknowns are —
  an external format nobody here has parsed, an adapter that is called rather than calling, and a
  machine credential the platform has never issued — and every one of those is answered by
  building the one-way feed end to end. Designing the order exchange against a feed that does not
  yet run would be designing against a guess. It also splits an iteration that was, laid out
  honestly, larger than iteration 7.
- Iteration 12's own ordering puts the **platform ahead of the adapter**. Machine credentials
  ([NFR-SEC-09](requirements.md#nfr-sec-09)), the headless run ADR 0026 specified and deferred, the ownership switch
  ([FR-ADM-10](requirements.md#fr-adm-10)) and the sync log ([FR-ADM-09](requirements.md#fr-adm-09)) need nothing from the source system's format: they
  are exercised with an HTTP client and shipped whether or not the adapter ever exists. That is
  not only sequencing convenience — a deployment with no source system at all still gains an
  automatable import, and the manual upload stops being an unguarded second writer. Only two
  seams depend on what a real export looks like, and both are data rather than design: the
  numbers in the commit policy, and the list of fields the exchange owns.
- The **adapter is a private sidecar**, the third such container after the address suggester and
  the payment one, and the format it speaks is not named here for the same reason the suggestion
  provider is not. Two rules from ADR 0054 shape everything else. It is **called by the source
  system**, not called by us — which inverts the suggestion sidecar and is why it is stateful,
  why it holds a volume, and why its failures have to be loud rather than silently degrading.
  And the platform models **one identity per entity** — `sourceId` is the source system's key
  and nothing else, as it always was. Whatever further bookkeeping that system's own
  identifiers require belongs to the adapter, so the platform gains no column, no second
  identity for an order line to snapshot, and no format knowledge at all. The one thing the
  import contract carries no way for a run to say a row's key _changed_, either. That was
  planned and dropped before it was built: a key the source system re-issues is rare enough
  that a feed which renames one is a thing an operator handles rather than a path the
  contract carries. A run that meets a renamed key reads it as a create plus a soft delete,
  so the way to rename one is to take the catalog back, correct the key in the product
  editor, and hand it over again — which needs no deploy, because the ownership switch is
  the same one that turns the feed off. What the platform does not promise, and should not,
  is that the source system keeps its own keys consistent.
- What the exchange owns and what the shop owns is settled in iteration 12 rather than left to
  accumulate: the source system owns identity, name, category, price and stock; the shop owns
  everything a customer reads — descriptions, images, attributes, documents, pairings. Images are
  named explicitly because they are the case that looks like an omission and is not: the source
  system holds none, so they are admin-owned for good and the import contract has no image field.
  Attributes and packaging stay admin overlay, as iterations 5 and 6 already decided.
- A **price became a (product, price list) row** inside iteration 12 rather than after it
  (ADR 0059). The base price had been a column on `products`, which the adapter's mapper would
  have had to be written against — and rewritten a release later, over a table the exchange was
  by then actively writing. Two facts from the real export forced it rather than tidiness: the
  source exports products and prices as separate files, so a product legitimately exists before
  any price does; and a list that prices only part of the catalog silently charges everyone else
  the guest price, which the old shape could not even express as a question. With the column
  gone, "the default list" became a **badge one price list carries** rather than a reserved key,
  so which list guests and untiered accounts are charged is an admin decision that can be moved
  ([FR-AUTH-05](requirements.md#fr-auth-05) amended) — and moving it unpublishes what the newly badged list does not price,
  rather than refusing the move. It ships inside v1.10.0: the migration applies unattended, so
  it is a minor release under ADR 0044.

- **FR-ORD-06 was deleted and replaced by [FR-ADM-10](requirements.md#fr-adm-10)** (2026-09-10). The switch it asked for —
  turn the platform's own order transitions off while an external system owns them — is the same
  mechanism as the one the catalog needs, and writing it twice would have produced two unrelated
  toggles for one idea. [FR-ADM-10](requirements.md#fr-adm-10) is that mechanism with an **area**: the catalog now, order
  processing in iteration 13, which adds a value rather than a switch. It is a rule and not a
  disabled button — the API refuses a write to an externally owned field, and the greying-out in
  the admin panel only explains the refusal before it is hit. It also resolves what looked like a
  contradiction: the manual upload is not retired when the feed exists, and the way an operator
  gets it back when the feed breaks is to turn the ownership off, which needs no deploy.
  Maintenance mode needs no change to sit beside it — [FR-ADM-04](requirements.md#fr-adm-04) has only ever gated the public
  storefront and its read APIs, so a machine run populates a deployment that has not opened yet.
- Iteration 13 is the order exchange ([FR-ADM-08](requirements.md#fr-adm-08)), deferred out of 12 above. Three rules were
  agreed when it was first planned and still hold: **ownership, not conflict resolution** — the
  platform records what the customer submitted, the source system owns processing once an order
  has been exported, and nothing is merged; **the platform's status vocabulary stays coarse and
  the adapter maps onto it**, collapsing however many intermediate steps the source system moves
  an order through into the one transition a customer should read; and **updates are idempotent
  and forward-only**, since a polling adapter will re-send and every move it writes back has to
  state whether the customer hears about it ([FR-NOTIF-03](requirements.md#fr-notif-03)). Two more were settled in advance: an
  exchange writes as **the integration's token**, never as a person — a revision an outside
  system wrote carries no author today, and gets a `source` of its own when there is something to
  write it (an operator's name in the other system travels as an opaque label and is never
  resolved to a platform account); and a customer cancellation on an exported order is an
  export-shape question, since forward-only write-back would otherwise overwrite it silently.
  Iteration 11 left this iteration exactly one debt and paid it: transitions are written as
  service operations with the role table stated once.
- The **price basis was removed** mid-iteration (2026-09-11, ADR 0058), which was not planned
  into iteration 12 and earned its place from the real export: the source system quotes per unit
  of measure, so the assumption the basis encoded — that a price may be exact only per lot — is
  false. It is taken here rather than later for two reasons that both belong to this iteration.
  The basis is the **denominator of an owned price**, so an admin could re-price an externally
  owned product without touching a field the ownership rule covers ([FR-ADM-10](requirements.md#fr-adm-10)); and the tier
  price refactor that follows it in this iteration would otherwise have to decide whether a
  denominator belongs on `products` or on every price row. [FR-UNIT-04](requirements.md#fr-unit-04) and [FR-UNIT-10](requirements.md#fr-unit-10) are
  rewritten, and [FR-ADM-06](requirements.md#fr-adm-06) keeps the publication gate on a different argument.
- **[FR-CAT-01](requirements.md#fr-cat-01) was amended late in the iteration** (2026-09-15), for a reason only the feed
  produces: the sync creates a category before any of its products are published and empties one
  by regrouping upstream, so the storefront had to say what an empty grouping is before an
  unattended feed could be allowed to make them. A category with nothing publicly visible beneath
  it is now absent from the overview, the navigation and the sitemap, and stays editable in the
  admin panel throughout. The policy gained two ceilings alongside it — categories created and
  categories emptied — which are defaulted config keys and so version-neutral.
- Two operability requirements ride with iteration 12 because it is the release that makes them
  urgent — [NFR-OPS-06](requirements.md#nfr-ops-06) (what a deploy costs in downtime, how to see it failed, how to roll back)
  and [NFR-OPS-07](requirements.md#nfr-ops-07) (what a half-finished sync leaves behind). The second is largely already true:
  ADR 0026 applies a run in one transaction, so the failure mode it names cannot produce a
  half-applied catalog. What iteration 12 adds is making the failure **visible** — a run that
  died in the adapter, before it ever became a run, is recorded as a failed one rather than
  vanishing.
- Iteration 14 is online card payment, deferred from 11 (2026-09-06) and pushed one further by
  the iteration-12 split. It is blocked on something that cannot be built: a merchant account the
  shop does not yet have. It is also the least urgent of the three — nothing about the current
  flow needs it, since a card payment arranged with the manager is already a recorded method —
  and the most speculative, since the provider is unchosen. Sequencing it after the source-system
  exchange means it is designed against a live order flow with real orders in it. `card-later` is
  therefore **not** renamed in iteration 11: it accurately names an offline arrangement, and an
  online provider adds a second method beside it rather than redefining the first. It is offered
  to a private customer only, though: a company is invoiced, and an offline card arrangement
  leaves no more paper than cash does ([FR-CART-04](requirements.md#fr-cart-04) amended 2026-09-08, ADR 0039).
- Still open, to be decided before their iteration rather than now: whether audit records and usage
  metrics (page and product views, search-to-order funnels) are worth persisting beyond the log
  aggregation [NFR-OPS-03](requirements.md#nfr-ops-03)/[05](requirements.md#nfr-ops-05) already provide; and a security assessment pass across the whole
  feature surface once the machine endpoints exist, which is a release activity rather than a
  requirement.
- Client reviews v1.0.0 on the **dev** environment only. Frame that feedback round as
  catalog/content/UX review — no accounts or cart exist yet, and prices are default-list only.
- SSR and sitemap ([NFR-SEO-01](requirements.md#nfr-seo-01)/[02](requirements.md#nfr-seo-02)) are built in iteration 2, but the dev environment stays
  `noindex`; indexing is enabled only when prod goes live.
- Maintenance mode ([FR-ADM-04](requirements.md#fr-adm-04)) is the go-live gate. A deployment boots with it **off** (the
  default runtime setting); the admin logs in — the login route stays reachable — flips it
  **on** to populate catalog and content behind a 503'd storefront via [FR-ADM-01](requirements.md#fr-adm-01)-03, then flips
  it **off** to launch. The brief window before it is first switched on is harmless: prod DNS
  is not public and dev stays `noindex` until launch.

## Explicitly out of scope for now

- UI localization / i18n — both deployments are single-locale; revisit only if a deployment ever needs a second language
- Automated delivery/courier API integration
- Live/automatic sync from the legacy source system — in scope: the catalog direction as
  iteration 12 ([FR-ADM-07](requirements.md#fr-adm-07)), the order direction as iteration 13 ([FR-ADM-08](requirements.md#fr-adm-08)). What stays out is
  any direction in which the platform writes catalog content back into the source system: the
  ownership split runs the other way (see the iteration-12 notes), and the exchange protocol
  offers no such message in any case
- Iterations 13 and 14 were swapped (2026-09-15). Order exchange had held row 13 since the
  iteration-11 planning round; customer exchange did not exist as a requirement at all, because
  the source system's stock site-exchange setting carries a catalog and orders and nothing else,
  and the platform's own assumption since iteration 2 had been that only the catalog ever
  arrived from outside. An upgrade over there made a fuller exchange possible, and asking what
  a fully source-driven deployment would still need a person for surfaced the gap: **iteration
  12 handed over the prices but nothing hands over the tier**. A price arrives keyed by
  `price:<key>` ([FR-AUTH-05](requirements.md#fr-auth-05)), and which key a given customer is charged is still assigned by
  hand here — a half-closed loop already running in production. Closing it first follows the
  rule that has ordered this roadmap since iteration 5: the thing that constrains the data goes
  before the thing that consumes it. The practical argument points the same way — with no
  `sourceId` on an account, every order exported first would have the source system invent a
  counterparty from the order's party fields, and the customer exchange would arrive a release
  later to reconcile duplicates it caused itself.
- Iteration 13 is where the **ownership switch stops being a catalog feature**. ADR 0056 built
  it with an area and one value; customers is the second, orders the third, and each is a value
  rather than a mechanism. The sync run table gains an `area` beside them rather than being
  split in three: the run lifecycle, the staged reasons, the actor, the counts, the
  state-change notifications (ADR 0057) and the work-awaiting count ([FR-WORK-02](requirements.md#fr-work-02)) are the same
  in every area, and only the row payload and the owned-field list differ — and those already
  live in the contract layer. The **machine endpoint paths do not move**: `/machine/sync/runs`
  shipped in v1.10.0 and an adapter is being written against it, so the area travels in the
  body, where the per-run field intent already travels. Renaming it would be a major under
  ADR 0044 for the sake of a tidier URL.
- The **health mails are shared machinery with unshared words** ([FR-NOTIF-09](requirements.md#fr-notif-09)). One
  notifier serves both areas and the change-of-state rule ADR 0057 argued for is unchanged, but
  each area is read against its own last run and writes its own sentences: two feeds that break
  independently must not clear each other, and "Catalog update failed" about an account import
  is wrong in the subject line, which is the only part of a mail that is certainly read. The
  catalog's fourth message — products that arrived unpublished — has deliberately **no customer
  counterpart**: an invited account has already been sent its own set-a-password link
  ([FR-ADM-13](requirements.md#fr-adm-13)), so there is no queue on anybody's desk to announce. Who reads them did
  *not* split with the wording: FR-NOTIF-09 names the admin, and a manager's readership of
  customer runs ([FR-ADM-09](requirements.md#fr-adm-09)) is the panel, which is the channel that works when SMTP does
  not.
- The customer exchange is stated as a **capability rather than a field list**: the adapter can
  do everything a manager can do to a customer account and an order, and while the area is
  owned the admin panel's side of it is closed completely rather than field by field. A first
  cut enumerated the columns the source system may write — tier, company name, registration id
  — and drew the line at "who may sign in", keeping approval here on the grounds that no field
  over there maps onto it. That was answered by making one: an account state on the source
  system's own customer record, which is where the decision belongs if the goal is a deployment
  nobody administers by hand. The field list went with it, because enumerating columns is the
  wrong shape for "do what the manager does" and would have needed extending on every iteration
  that gives a manager a new button.
- The line that survived the reframe is **narrower and sharper: the exchange never issues a
  credential.** It can ask for an account, and the platform creates it in the state a manager's
  approval creates it in and sends the person their own set-a-password link. It cannot set a
  password, and it cannot delete — deleting an account is the account holder's own act under
  [FR-AUTH-06](requirements.md#fr-auth-06), irreversible, and a mis-mapped key in a feed must not be able to destroy who
  somebody was. A removal on the source system's side deactivates instead, which is reversible
  and says what the shop actually means.
- **Deletion stops at the platform boundary, and the wording says so.** An earlier draft had it
  travelling outward as an erasure the receiving system was expected to honour, which is a
  promise the shop would have to keep by hand and the platform cannot verify — and the source
  system has its own retention obligations for the same relationship. So deleting an account
  means what it can mean here: no sign-in, no mail, personal details cleared, reported outward
  as withdrawn and no further claim made ([NFR-LEGAL-08](requirements.md#nfr-legal-08)). The cleared row **keeps the source
  system's key**, which looks like the opposite of erasure and is what makes the erasure hold:
  without it the next run meets a customer it has no account for and creates one, mailing a
  person who asked to be gone. It also means the outcome is honestly a closed and cleared
  account rather than anonymity, and the privacy page has to describe it in those terms.
- Two things stay outside the switch. **A staff account is not a customer** — roles, and the
  administration of admin and manager accounts, are portal administration with no counterpart
  in the source system, so an admin can always appoint another admin. And the **screens stay
  readable** while every action on them is refused: staff must be able to see what a customer
  sees, and the counts of work awaiting attention are read from exactly those rows.
- Approval moving outward has a **cost worth stating**: a registration a manager used to answer
  in seconds now waits for the next exchange and for somebody to look at it over there. The
  recovery path is the one ADR 0056 already documents — take the area back, approve by hand,
  hand it over again. A declined registration is **deactivated** rather than given a state of
  its own, which keeps the work-awaiting count honest without a fifth account state that reads
  identically to the fourth.
- There is deliberately **no manual import for orders** and **no catalog export**. An order is
  a thread of versions with a customer pointer, snapshotted prices and a notification decision
  per move (ADR 0051); a file of state changes is a worse order screen, and ADR 0056 already
  documents the recovery path as taking the area back and working the order by hand. A catalog
  export was considered for symmetry with the customer one and dropped: ADR 0054 states that no
  direction writes catalog content back, and "the screens should match" is not a reason to
  amend it. Customers get a manual import because they have a case the catalog's fallback
  argument does not cover — a go-live with several hundred existing customers whose tiers are
  already settled over there.
- Sync becomes **three screens rather than one with a filter** (2026-09-16, ADR 0060): the catalog, the
  customers and, later, the orders each get their own slug and their own way in from the admin
  panel, because who may read them differs ([FR-ADM-09](requirements.md#fr-adm-09)) and a manager should not arrive at a log
  whose first half is refused. A run's own page keeps its existing path — a staged-run link that
  has already been mailed must not stop working, and a run id says which area it belongs to. For
  the same reason the **work-awaiting count splits per area**: a staged catalog run is an
  admin's, a staged customer run is a manager's too, and one figure covering both would show a
  manager work they cannot finish ([FR-WORK-02](requirements.md#fr-work-02)).
- The customer exchange **issues no credential and never deletes** (2026-09-16, ADR 0061). It can
  ask for an account; the platform creates it in its own invited state and mails the person the
  same set-a-password link a manager's approval sends ([FR-ADM-13](requirements.md#fr-adm-13)), so no password ever travels in
  a feed or sits in a staged run. A removal upstream maps to a **deactivation**, and an account
  the holder has closed themselves keeps its source key so that the next run asking for that
  customer is refused rather than obeyed ([FR-ADM-15](requirements.md#fr-adm-15)) — a deletion the next run could undo is
  not a deletion. It also means what [FR-AUTH-06](requirements.md#fr-auth-06) produces is a closed and cleared account
  rather than anonymity, which the privacy page has to say in those words.
- The **machine surface is the one thing not parameterised by area**: the customer exchange gets
  its own paths (`/machine/sync/customers/...`) and its own token scope rather than an `area`
  field on the catalog's, because a machine route names the one capability it needs and the guard
  checks it before the body is read. A credential that receives a price list should not also be
  able to invite people into accounts. The paths already published are untouched, so the v1.10.0
  adapter keeps working.
- **Registering stays the person's own act, so the exchange needs a way to meet them halfway**
  (2026-09-17). An account somebody creates on the storefront carries no source key, and matching
  is by key alone — so nothing the owning system sends can ever reach it, and a registration can
  sit in `pending` that neither side is able to approve: the other system cannot see it, and
  every staff action on a customer is refused while the area is owned. Two things close that,
  and the third makes them usable. A run may **claim** such an account by email address
  ([FR-ADM-17](requirements.md#fr-adm-17)) — once, off by default, shown in the preview as its own kind of change, and
  staged for a person unless the deployment has said otherwise, because the risk it carries is a
  typo'd address upstream taking over a real customer's account. An admin may set the key **by
  hand** in the account editor, as they always could for a product, which is why the catalog
  never had this deadlock. And the machine surface gains its first **read**
  ([FR-ADM-18](requirements.md#fr-adm-18)): until now it was write-only, so the flow where the
  source system creates a counterparty for a new registrant and hands the key back could not
  physically happen, while [FR-ADM-15](requirements.md#fr-adm-15) and [NFR-LEGAL-07](requirements.md#nfr-legal-07)
  already described account details as travelling outward. The  read is its own token capability
  and answers whether or not anybody owns customers — the case it exists for is precisely the
  one before the hand-over.

- **Ownership is presented as one shop, stored as areas.** An operator handing everything over is
  doing one thing, so the panel offers one switch that moves every area and a badge that says the
  shop is externally owned rather than listing the areas one by one; but the stored setting stays
  one value per area, and the audit still records the area each one moved ([FR-ADM-10](requirements.md#fr-adm-10)). A fourth
  stored "everything" flag would be a value that can disagree with the three beneath it, and an
  audit row naming no area would leave a gap in the history of the area it moved. So the master
  switch is a read over the areas and an action across them — one request, one transaction, one
  row per area that actually changed, shown as a single entry.
