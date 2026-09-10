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
| 11  | Order processing, payment state & order documents → **tag v1.9.0**                             | FR-ORD-01…05, FR-CART-05 + FR-CART-06 amended, FR-NOTIF-03/07/08 + FR-ORD-02 amended, FR-ACC-02, FR-WORK-02/04 + FR-AUTH-04 amended, NFR-LEGAL-04, NFR-SEC-10, NFR-OPS-02 amended   |
| 12  | Automated catalog sync from the source system → **tag v1.10.0**                                | FR-ADM-07/09/10, NFR-SEC-09, NFR-OPS-06/07, FR-ADM-02/04 + FR-WORK-02 amended                                                                                                       |
| 13  | Order exchange with the source system → **tag v1.11.0**                                        | FR-ADM-08, FR-ADM-09/10 amended, FR-ORD-02/03 amended                                                                                                                               |
| 14  | Online card payment → **tag v1.12.0**                                                          | FR-CART-04/06 amended                                                                                                                                                               |

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
  state read two ways, the same lens trick as ADR 0042. **An order is a thread of versions**
  (ADR 0051): every change and every move writes one, so the thread is the order's history and any
  point in it reads back whole, and the reference quoted on the phone and the mailed link both
  survive. A change is **not** a state — a first cut had an `adjusted` acceptance beside
  `approved`, which made changing a request silently accept it and needed a special case for an
  order already packed. An adjustment may change everything the checkout asked — lines, prices, the
  price list the order is read from, fulfilment, addresses, party, payment method, contact — and
  nothing the customer wrote in their own words (FR-ORD-03 amended 2026-09-08); it is offered
  wherever the order stands, since a shortage found while packing is exactly the case it exists
  for. **The customer's view of the order is a pointer; the mail is a
  decision** (FR-NOTIF-03 amended 2026-09-08): the pointer follows every move, so their page
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
  (NFR-SEC-09), the headless run ADR 0026 specified and deferred, the ownership switch
  (FR-ADM-10) and the sync log (FR-ADM-09) need nothing from the source system's format: they
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
  import contract does gain is a way for a run to say that a row's key _changed_
  (`previousSourceId`), so a renamed key is a rename rather than a create plus a delete —
  which is a statement about one row, not a second identity.
- What the exchange owns and what the shop owns is settled in iteration 12 rather than left to
  accumulate: the source system owns identity, name, category, price and stock; the shop owns
  everything a customer reads — descriptions, images, attributes, documents, pairings. Images are
  named explicitly because they are the case that looks like an omission and is not: the source
  system holds none, so they are admin-owned for good and the import contract has no image field.
  Attributes and packaging stay admin overlay, as iterations 5 and 6 already decided.
- **FR-ORD-06 was deleted and replaced by FR-ADM-10** (2026-09-10). The switch it asked for —
  turn the platform's own order transitions off while an external system owns them — is the same
  mechanism as the one the catalog needs, and writing it twice would have produced two unrelated
  toggles for one idea. FR-ADM-10 is that mechanism with an **area**: the catalog now, order
  processing in iteration 13, which adds a value rather than a switch. It is a rule and not a
  disabled button — the API refuses a write to an externally owned field, and the greying-out in
  the admin panel only explains the refusal before it is hit. It also resolves what looked like a
  contradiction: the manual upload is not retired when the feed exists, and the way an operator
  gets it back when the feed breaks is to turn the ownership off, which needs no deploy.
  Maintenance mode needs no change to sit beside it — FR-ADM-04 has only ever gated the public
  storefront and its read APIs, so a machine run populates a deployment that has not opened yet.
- Iteration 13 is the order exchange (FR-ADM-08), deferred out of 12 above. Three rules were
  agreed when it was first planned and still hold: **ownership, not conflict resolution** — the
  platform records what the customer submitted, the source system owns processing once an order
  has been exported, and nothing is merged; **the platform's status vocabulary stays coarse and
  the adapter maps onto it**, collapsing however many intermediate steps the source system moves
  an order through into the one transition a customer should read; and **updates are idempotent
  and forward-only**, since a polling adapter will re-send and every move it writes back has to
  state whether the customer hears about it (FR-NOTIF-03). Two more were settled in advance: an
  exchange writes as **the integration's token**, never as a person — a revision an outside
  system wrote carries no author today, and gets a `source` of its own when there is something to
  write it (an operator's name in the other system travels as an opaque label and is never
  resolved to a platform account); and a customer cancellation on an exported order is an
  export-shape question, since forward-only write-back would otherwise overwrite it silently.
  Iteration 11 left this iteration exactly one debt and paid it: transitions are written as
  service operations with the role table stated once.
- Two operability requirements ride with iteration 12 because it is the release that makes them
  urgent — NFR-OPS-06 (what a deploy costs in downtime, how to see it failed, how to roll back)
  and NFR-OPS-07 (what a half-finished sync leaves behind). The second is largely already true:
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
  leaves no more paper than cash does (FR-CART-04 amended 2026-09-08, ADR 0039).
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
- Live/automatic sync from the legacy source system — in scope: the catalog direction as
  iteration 12 (FR-ADM-07), the order direction as iteration 13 (FR-ADM-08). What stays out is
  any direction in which the platform writes catalog content back into the source system: the
  ownership split runs the other way (see the iteration-12 notes), and the exchange protocol
  offers no such message in any case
