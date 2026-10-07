# Requirements

Defines **what** the system does; delivery order lives in [`roadmap.md`](roadmap.md). IDs are namespaced
(`FR-<domain>-NN` / `NFR-<domain>-NN`, per ISO/IEC/IEEE 29148 practice) so new entries insert
without renumbering. Each requirement is a heading carrying an explicit anchor, so a link to one
survives a retitling; the Contents block below is generated from those headings by
`tools/generate-requirements-index.mjs`.

---

## Contents

**Functional Requirements** — [FR-NAV](#fr-nav) · [FR-CAT](#fr-cat) · [FR-UNIT](#fr-unit) · [FR-STOCK](#fr-stock) · [FR-SET](#fr-set) · [FR-DOC](#fr-doc) · [FR-SEARCH](#fr-search) · [FR-ATTR](#fr-attr) · [FR-ADM](#fr-adm) · [FR-AUTH](#fr-auth) · [FR-CART](#fr-cart) · [FR-ORD](#fr-ord) · [FR-NOTIF](#fr-notif) · [FR-WORK](#fr-work) · [FR-ACC](#fr-acc)

**Non-Functional Requirements** — [NFR-LEGAL](#nfr-legal) · [NFR-SEC](#nfr-sec) · [NFR-SEO](#nfr-seo) · [NFR-OPS](#nfr-ops)

**[Navigation & Static Pages (FR-NAV)](#fr-nav)**

- [FR-NAV-01](#fr-nav-01) — Navigation between all pages
- [FR-NAV-02](#fr-nav-02) — About page
- [FR-NAV-03](#fr-nav-03) — Payment and delivery conditions page
- [FR-NAV-04](#fr-nav-04) — Contact page with office map
- [FR-NAV-05](#fr-nav-05) — Contact details in the header
- [FR-NAV-06](#fr-nav-06) — Contact form
- [FR-NAV-07](#fr-nav-07) — Links to the shop elsewhere

**[Catalog (FR-CAT)](#fr-cat)**

- [FR-CAT-01](#fr-cat-01) — Category overview on the main page
- [FR-CAT-02](#fr-cat-02) — Products grouped by category
- [FR-CAT-03](#fr-cat-03) — Paginated category grid
- [FR-CAT-04](#fr-cat-04) — What a list item shows
- [FR-CAT-05](#fr-cat-05) — What a product page shows
- [FR-CAT-06](#fr-cat-06) — Cards or rows, remembered
- [FR-CAT-07](#fr-cat-07) — How a category is shown
- [FR-CAT-08](#fr-cat-08) — Category description (withdrawn)
- [FR-CAT-09](#fr-cat-09) — A featured row on the main page
- [FR-CAT-10](#fr-cat-10) — A product sold as a set of parts
- [FR-CAT-11](#fr-cat-11) — Variants named on a product's pictures
- [FR-CAT-12](#fr-cat-12) — A variant currently unavailable
- [FR-CAT-13](#fr-cat-13) — Variants behind a mark where a picture is small

**[Units of Sale & Packaging (FR-UNIT)](#fr-unit)**

- [FR-UNIT-01](#fr-unit-01) — Piece, pack and box
- [FR-UNIT-02](#fr-unit-02) — Packaging data
- [FR-UNIT-03](#fr-unit-03) — Minimum order quantity
- [FR-UNIT-04](#fr-unit-04) — A price is per piece
- [FR-UNIT-05](#fr-unit-05) — Prices per unit on the product page
- [FR-UNIT-06](#fr-unit-06) — Box volume and weight in the attribute table
- [FR-UNIT-07](#fr-unit-07) — Choosing a unit to buy in
- [FR-UNIT-08](#fr-unit-08) — Price and packaging on a list tile
- [FR-UNIT-09](#fr-unit-09) — Packaging summary formula
- [FR-UNIT-10](#fr-unit-10) — Totals never round
- [FR-UNIT-11](#fr-unit-11) — Boxes a product ships as

**[Stock Availability (FR-STOCK)](#fr-stock)**

- [FR-STOCK-01](#fr-stock-01) — Optional stock quantity
- [FR-STOCK-02](#fr-stock-02) — Three availability states
- [FR-STOCK-03](#fr-stock-03) — Availability badge
- [FR-STOCK-04](#fr-stock-04) — Out of stock cannot be ordered
- [FR-STOCK-05](#fr-stock-05) — Availability orders every listing

**[Sold-Together Sets (FR-SET)](#fr-set)**

- [FR-SET-01](#fr-set-01) — Mutual pairings
- [FR-SET-02](#fr-set-02) — When a cart satisfies a pairing
- [FR-SET-03](#fr-set-03) — What an unsatisfied pairing offers
- [FR-SET-04](#fr-set-04) — Advisory unless configured as enforced
- [FR-SET-05](#fr-set-05) — Pairing marker on buying controls

**[Product Documents (FR-DOC)](#fr-doc)**

- [FR-DOC-01](#fr-doc-01) — Uploading a document
- [FR-DOC-02](#fr-doc-02) — Linking documents to products
- [FR-DOC-03](#fr-doc-03) — Documents on the product page
- [FR-DOC-04](#fr-doc-04) — Expiry states in the admin list
- [FR-DOC-05](#fr-doc-05) — A document held elsewhere

**[Search (FR-SEARCH)](#fr-search)**

- [FR-SEARCH-01](#fr-search-01) — Search bar in the header
- [FR-SEARCH-02](#fr-search-02) — Matching on product name
- [FR-SEARCH-03](#fr-search-03) — Results ordered by relevance
- [FR-SEARCH-04](#fr-search-04) — Sort controls and shareable URLs
- [FR-SEARCH-05](#fr-search-05) — Type-ahead suggestions
- [FR-SEARCH-06](#fr-search-06) — What a suggestion shows
- [FR-SEARCH-07](#fr-search-07) — Categories among the suggestions
- [FR-SEARCH-08](#fr-search-08) — Typed on the other keyboard layout

**[Filterable Attributes (FR-ATTR)](#fr-attr)**

- [FR-ATTR-01](#fr-attr-01) — Defining a filterable attribute
- [FR-ATTR-02](#fr-attr-02) — A product attribute becomes filterable
- [FR-ATTR-03](#fr-attr-03) — Unreadable number values
- [FR-ATTR-04](#fr-attr-04) — Filter panel with counts
- [FR-ATTR-05](#fr-attr-05) — How selections combine
- [FR-ATTR-06](#fr-attr-06) — Selection chips and reset
- [FR-ATTR-07](#fr-attr-07) — Selection is part of the URL
- [FR-ATTR-08](#fr-attr-08) — Attribute links from a product page
- [FR-ATTR-09](#fr-attr-09) — Attribute registry and renaming
- [FR-ATTR-10](#fr-attr-10) — Attribute names offered while typing
- [FR-ATTR-11](#fr-attr-11) — A category's own attribute list
- [FR-ATTR-12](#fr-attr-12) — The catalogue's own attribute list
- [FR-ATTR-13](#fr-attr-13) — Subcategories under a selection

**[Admin & Catalog Sync (FR-ADM)](#fr-adm)**

- [FR-ADM-01](#fr-adm-01) — Editing a product by hand
- [FR-ADM-02](#fr-adm-02) — Bulk catalog sync
- [FR-ADM-03](#fr-adm-03) — Editing static pages
- [FR-ADM-04](#fr-adm-04) — Maintenance mode
- [FR-ADM-05](#fr-adm-05) — Admin product list
- [FR-ADM-06](#fr-adm-06) — Publication gate
- [FR-ADM-07](#fr-adm-07) — Catalog import over a machine endpoint
- [FR-ADM-08](#fr-adm-08) — Order exchange with the source system
- [FR-ADM-09](#fr-adm-09) — Sync activity log
- [FR-ADM-10](#fr-adm-10) — External ownership of an area
- [FR-ADM-11](#fr-adm-11) — Customer exchange over the machine endpoint
- [FR-ADM-12](#fr-adm-12) — Bulk customer import
- [FR-ADM-13](#fr-adm-13) — The exchange issues no credential
- [FR-ADM-14](#fr-adm-14) — Accounts are matched by their source key
- [FR-ADM-15](#fr-adm-15) — The account holder's own data travels outward only
- [FR-ADM-16](#fr-adm-16) — A repeated instruction changes nothing
- [FR-ADM-17](#fr-adm-17) — Claiming an account registered on the shop
- [FR-ADM-18](#fr-adm-18) — Reading customer accounts outward
- [FR-ADM-19](#fr-adm-19) — A category counts its subtree
- [FR-ADM-20](#fr-adm-20) — Finding what a product's content lacks
- [FR-ADM-21](#fr-adm-21) — Deleting a product permanently
- [FR-ADM-22](#fr-adm-22) — Deleted products are kept apart
- [FR-ADM-23](#fr-adm-23) — Deleting an account on the person's request

**[Accounts, Roles & Pricing (FR-AUTH)](#fr-auth)**

- [FR-AUTH-01](#fr-auth-01) — Sign-up and approval
- [FR-AUTH-02](#fr-auth-02) — Password reset
- [FR-AUTH-03](#fr-auth-03) — Three roles
- [FR-AUTH-04](#fr-auth-04) — Manager account administration
- [FR-AUTH-05](#fr-auth-05) — Tier to price-list mapping
- [FR-AUTH-06](#fr-auth-06) — Deleting your own account
- [FR-AUTH-07](#fr-auth-07) — Admin login gate
- [FR-AUTH-08](#fr-auth-08) — Changing your own password
- [FR-AUTH-09](#fr-auth-09) — Company suggestions at sign-up
- [FR-AUTH-10](#fr-auth-10) — Registered address as first address
- [FR-AUTH-11](#fr-auth-11) — Declining a registration

**[Cart & Checkout (FR-CART)](#fr-cart)**

- [FR-CART-01](#fr-cart-01) — Cart summary in the header
- [FR-CART-02](#fr-cart-02) — Editing cart lines
- [FR-CART-03](#fr-cart-03) — Guest checkout
- [FR-CART-04](#fr-cart-04) — Payment method at checkout
- [FR-CART-05](#fr-cart-05) — Payment document for bank transfer
- [FR-CART-06](#fr-cart-06) — Online card payment
- [FR-CART-07](#fr-cart-07) — Delivery, pickup and preferred date
- [FR-CART-08](#fr-cart-08) — Free-text note on a cart line
- [FR-CART-09](#fr-cart-09) — Party the order is invoiced to
- [FR-CART-10](#fr-cart-10) — Cart persists between visits
- [FR-CART-11](#fr-cart-11) — Address suggestions at checkout

**[Order Processing (FR-ORD)](#fr-ord)**

- [FR-ORD-01](#fr-ord-01) — Order states
- [FR-ORD-02](#fr-ord-02) — Moving between states
- [FR-ORD-03](#fr-ord-03) — Accepting with adjustments
- [FR-ORD-04](#fr-ord-04) — Payment tracked separately
- [FR-ORD-05](#fr-ord-05) — Order documents

**[Notifications (FR-NOTIF)](#fr-notif)**

- [FR-NOTIF-01](#fr-notif-01) — Registration email
- [FR-NOTIF-02](#fr-notif-02) — Approval email
- [FR-NOTIF-03](#fr-notif-03) — Emailing a state change or adjustment
- [FR-NOTIF-04](#fr-notif-04) — New registration notifies a manager
- [FR-NOTIF-05](#fr-notif-05) — New order notifies a manager
- [FR-NOTIF-06](#fr-notif-06) — Order received confirmation
- [FR-NOTIF-07](#fr-notif-07) — Cancellation notifies a manager
- [FR-NOTIF-08](#fr-notif-08) — Account closure notifies a manager
- [FR-NOTIF-09](#fr-notif-09) — Exchange health emails

**[Work Awaiting Attention (FR-WORK)](#fr-work)**

- [FR-WORK-01](#fr-work-01) — Marker on the account control
- [FR-WORK-02](#fr-work-02) — What counts as awaiting attention
- [FR-WORK-03](#fr-work-03) — Counts link into their section
- [FR-WORK-04](#fr-work-04) — Counts follow the role

**[Account Self-Service (FR-ACC)](#fr-acc)**

- [FR-ACC-01](#fr-acc-01) — Order status on the account page
- [FR-ACC-02](#fr-acc-02) — Order PDF

**[Compliance (NFR-LEGAL)](#nfr-legal)**

- [NFR-LEGAL-01](#nfr-legal-01) — Privacy policy page
- [NFR-LEGAL-02](#nfr-legal-02) — Seller information page
- [NFR-LEGAL-03](#nfr-legal-03) — Cookie consent
- [NFR-LEGAL-04](#nfr-legal-04) — Withdrawal notice
- [NFR-LEGAL-05](#nfr-legal-05) — Data residency
- [NFR-LEGAL-06](#nfr-legal-06) — Open-source attribution page
- [NFR-LEGAL-07](#nfr-legal-07) — Disclosing a transfer of account details
- [NFR-LEGAL-08](#nfr-legal-08) — Deletion reaches only this platform
- [NFR-LEGAL-09](#nfr-legal-09) — Recorded consent to processing personal data
- [NFR-LEGAL-10](#nfr-legal-10) — An order accepts the terms it was placed under
- [NFR-LEGAL-11](#nfr-legal-11) — The tax basis of the prices
- [NFR-LEGAL-12](#nfr-legal-12) — A record that personal data was destroyed
- [NFR-LEGAL-13](#nfr-legal-13) — An account of the personal data the platform holds
- [NFR-LEGAL-14](#nfr-legal-14) — An order's personal details end

**[Security (NFR-SEC)](#nfr-sec)**

- [NFR-SEC-01](#nfr-sec-01) — HTTPS everywhere
- [NFR-SEC-02](#nfr-sec-02) — Rate-limited authentication
- [NFR-SEC-03](#nfr-sec-03) — Hashed passwords
- [NFR-SEC-04](#nfr-sec-04) — Server-side access control
- [NFR-SEC-05](#nfr-sec-05) — Validated request payloads
- [NFR-SEC-06](#nfr-sec-06) — Rate-limited order endpoints
- [NFR-SEC-07](#nfr-sec-07) — Rate-limited search
- [NFR-SEC-08](#nfr-sec-08) — Proxied address suggestions
- [NFR-SEC-09](#nfr-sec-09) — Machine tokens
- [NFR-SEC-10](#nfr-sec-10) — Credentials kept out of logs

**[SEO & Accessibility (NFR-SEO)](#nfr-seo)**

- [NFR-SEO-01](#nfr-seo-01) — Full content in the initial HTML
- [NFR-SEO-02](#nfr-seo-02) — Sitemap and robots.txt
- [NFR-SEO-03](#nfr-seo-03) — Responsive layout
- [NFR-SEO-04](#nfr-seo-04) — Listing variants kept out of the index

**[Operability (NFR-OPS)](#nfr-ops)**

- [NFR-OPS-01](#nfr-ops-01) — Deployment via CI/CD
- [NFR-OPS-02](#nfr-ops-02) — Separate dev and prod
- [NFR-OPS-03](#nfr-ops-03) — Central logs
- [NFR-OPS-04](#nfr-ops-04) — Backups and restore
- [NFR-OPS-05](#nfr-ops-05) — Search observability
- [NFR-OPS-06](#nfr-ops-06) — Bounded release and downtime
- [NFR-OPS-07](#nfr-ops-07) — A failed sync leaves consistent state

---

## Functional Requirements

### <a id="fr-nav"></a>Navigation & Static Pages (FR-NAV)

#### <a id="fr-nav-01"></a>FR-NAV-01 — Navigation between all pages

The platform provides navigation between all defined pages.

#### <a id="fr-nav-02"></a>FR-NAV-02 — About page

A dedicated page displays information about the company.

#### <a id="fr-nav-03"></a>FR-NAV-03 — Payment and delivery conditions page

A dedicated page displays payment and delivery conditions. Its prose is admin-editable ([FR-ADM-03](#fr-adm-03)); the conditions themselves are not typed into it but read from where checkout reads them — the delivery zones with their terms and free-delivery thresholds ([FR-CART-07](#fr-cart-07)) and the pickup points from the deployment's configuration, and the payment methods from the platform's own rule of which party may pay how ([FR-CART-04](#fr-cart-04)) — and are stated as checkout states them, so the page cannot promise something checkout does not offer. Checkout keeps its own hint for the address in front of it; this page is the whole picture, which checkout is not the place to read. It is not the terms an order accepts ([NFR-LEGAL-10](#nfr-legal-10)): what a given order is delivered and paid under is fixed in the order itself ([FR-ORD-03](#fr-ord-03)).

#### <a id="fr-nav-04"></a>FR-NAV-04 — Contact page with office map

A dedicated page displays contact information, including an embedded map of the company office.

#### <a id="fr-nav-05"></a>FR-NAV-05 — Contact details in the header

Main contact information (phone, email) is displayed in the site header.

#### <a id="fr-nav-06"></a>FR-NAV-06 — Contact form

A contact form lets a user reach the company by email, with an optional callback phone number.

#### <a id="fr-nav-07"></a>FR-NAV-07 — Links to the shop elsewhere

A deployment can list the places it also exists — a social account, a messenger, a marketplace shop — shown in the footer as icons beside the enquiry button. Each entry names where it goes, the icon that stands for it and the words that stand in for the icon, which are what a screen reader announces and what a reader sees where the icon does not load. The icons are drawn in the site's own colours and to the height of the control beside them, so an added service cannot change the shape of the footer. The list is deployment configuration rather than editable content; an empty one shows nothing.

---

### <a id="fr-cat"></a>Catalog (FR-CAT)

#### <a id="fr-cat-01"></a>FR-CAT-01 — Category overview on the main page

The main page displays an overview of all catalog categories: every top-level category with the first few of its subcategories named underneath, and a way to open the rest in place. Naming the second level is how a grouping says what is in it — on a phone, where a chip is already a full-width row, the names are left out and the category itself is one tap away. A category is a grouping of products rather than a thing in its own right, so one with no publicly visible product beneath it is not shown, not linked in the navigation and not offered to a crawler — a category the sync has just created (its products not yet published, [FR-ADM-06](#fr-adm-06)) and one the sync has emptied are both absent until there is something to see. It stays editable in the admin panel throughout.

#### <a id="fr-cat-02"></a>FR-CAT-02 — Products grouped by category

Products are grouped by category (incl. subcategories); this grouping is navigable. The catalogue index the navigation leads to is the listing one level above any category: every publicly visible product, with the top-level categories offered where a category offers its subcategories — all of them, at every width, where a category's own list may be shortened on a narrow screen — and its breadcrumb naming only itself, so the page holds the same shape on the way down. Its filters are its own ([FR-ATTR-12](#fr-attr-12)).

#### <a id="fr-cat-03"></a>FR-CAT-03 — Paginated category grid

Products within a selected category, or the whole catalogue ([FR-CAT-02](#fr-cat-02)), are shown as a paginated grid. Above it, in one row, the listing says how many products the current filters leave — the whole listing rather than the page of it on screen, which the pagination names — and offers the two ways of asking for them differently: the ordering and the choice of shape ([FR-CAT-06](#fr-cat-06)). Where the filters have collapsed into a disclosure the ordering goes with them, since the disclosure is then the one place a narrow screen arranges the listing from. A search's results are headed by the same row, counting what the query and the filters leave together.

#### <a id="fr-cat-04"></a>FR-CAT-04 — What a list item shows

A product list item displays an image gallery (slider), name and price, and links to the full product page. Its price detail follows [FR-UNIT-08](#fr-unit-08) and its availability [FR-STOCK-03](#fr-stock-03).

#### <a id="fr-cat-05"></a>FR-CAT-05 — What a product page shows

A product page displays name, price, full rich-text description, an image gallery, and a table of custom attributes (e.g. color: blue). Prices follow [FR-UNIT-05](#fr-unit-05); the attribute table also carries the packaging facts of [FR-UNIT-06](#fr-unit-06). An attribute is stored only once it has both a name and a value; a half-filled row is dropped on save rather than refused. Availability follows [FR-STOCK-03](#fr-stock-03), and the documents linked to the product [FR-DOC-03](#fr-doc-03).

#### <a id="fr-cat-06"></a>FR-CAT-06 — Cards or rows, remembered

Product listings (category and search results) can be shown as a grid of cards or as a list of rows; both carry the same buying controls. The choice is remembered across visits and applies to every listing. Where the available width allows only one shape, both are shown in that shape and the choice is not offered.

#### <a id="fr-cat-07"></a>FR-CAT-07 — How a category is shown

Wherever the storefront shows a category it shows the same thing: a chip carrying the category's name, with its mark beside the name and never instead of it — the main page, the catalogue index, the subcategory navigation of a listing, and the category suggestions of a search ([FR-SEARCH-07](#fr-search-07)) alike. A category may carry a mark, trimmed to a square when it is uploaded; one with no mark is its name in the same chip. The chip comes in two sizes, a larger one where categories are what a screen is showing and a smaller one where they sit beside something else, and nothing but the size differs between them ([ADR 0063](adr/0063-a-category-is-a-chip.md)). A category is not drawn as a picture of the products beneath it.

#### <a id="fr-cat-08"></a>FR-CAT-08 — Category description (withdrawn)

Withdrawn before it was built. A category carries no description: no page had a place for one, and a search engine writes its own summary of a category listing. The number is not reused.

#### <a id="fr-cat-09"></a>FR-CAT-09 — A featured row on the main page

The main page shows a row of five products above the category overview, under a heading of its own. An admin may mark products as featured; the row draws on those first and fills whatever places are left from the rest of the catalog, so a deployment that marks nothing still has a row and never has to maintain one. Which featured products, which others, and in what order are chosen at random when the shop is opened — coming back to the main page from a product finds the same row, a reload draws a new one — and nothing on the row says which entries were marked. A product that is out of stock ([FR-STOCK-03](#fr-stock-03)) is never shown, featured or not; where nothing is left to show the row is absent rather than empty. Each entry carries what a listing's item carries ([FR-CAT-04](#fr-cat-04)) — so what can be seen and bought from a listing can be seen and bought from here — drawn as a narrower card with its picture set in from the edges and without the unit facts, so the row does not outweigh the categories under it; a picture keeps its variant label ([FR-CAT-11](#fr-cat-11)). The row stands on a band of its own across the whole width of the screen; where the screen is narrower than five cards it scrolls sideways, and it never moves on its own. The mark is maintained in the admin panel only; a catalog exchange neither sets nor clears it.

#### <a id="fr-cat-10"></a>FR-CAT-10 — A product sold as a set of parts

A product may name the parts it is sold as — two or three short words, such as cup and lid — while one listing entry, one price and one piece stand for the whole set. Such a product is marked as a set wherever its buying controls are: on a list item and a cart line beside its availability, naming its parts on hover, and on its page under the packaging facts, naming them in full. An attribute key ending in one of its parts in parentheses — "Colour (cup)" — describes that part: the attribute table shows it as written, but it is filtered and linked as the key before the parentheses ([FR-ATTR-02](#fr-attr-02)), so a black cup with a white lid is found under either colour. A parenthesis naming none of its parts stays part of the key, as any other text does. Parts are maintained in the admin panel only and change nothing about how the product is priced, counted, packed or ordered; its boxes follow [FR-UNIT-11](#fr-unit-11) as any product's do.

#### <a id="fr-cat-11"></a>FR-CAT-11 — Variants named on a product's pictures

A product may name its variants — the colours or designs it comes in where the source system carries them as one article, sold assorted or chosen in words on the cart line ([FR-CART-08](#fr-cart-08)). A variant is a short name, listed in an order the shop chooses, and each of the product's pictures shows one variant or none: a variant may have several pictures or none yet, and a picture of the whole range belongs to no variant.

How the variants are shown follows the size of the pictures they are shown with, not the size of the screen. Beside the product page's gallery ([FR-CAT-05](#fr-cat-05)) they are listed next to it and never over a picture, so no part of one is hidden: in full, wrapping rather than shortening, with the variant of the picture on show marked however it came to be shown. Pointing at a name, focusing it or tapping it brings its first picture into the gallery, and the gallery stays there; a variant with no picture is listed but moves nothing. In a card's gallery — a list item drawn as a card ([FR-CAT-04](#fr-cat-04), [FR-CAT-06](#fr-cat-06)) and the featured row ([FR-CAT-09](#fr-cat-09)) — there is no list: each picture showing a variant carries its name as a label over its top-left edge, on one line and shortened where it does not fit, so turning through the pictures names them. A picture too small to carry a label carries none, and the variants are reached through a mark instead ([FR-CAT-13](#fr-cat-13)). Wherever a picture shows a variant, its text alternative names it in full, and the gallery keeps the order its pictures were arranged in.

Variants are for display only: choosing one changes nothing about the cart line, its note or the order ([ADR 0064](adr/0064-a-variant-is-a-name-on-a-picture.md)). They are maintained in the admin panel only; a catalog exchange neither reads nor writes them, however the catalog is owned ([FR-ADM-10](#fr-adm-10)).

#### <a id="fr-cat-12"></a>FR-CAT-12 — A variant currently unavailable

A variant may be marked **currently unavailable** rather than removed, for goods that run out of one colour and come back. Its pictures are withheld from every gallery — a list item opens on the next picture it has, and a product whose every picture shows an unavailable variant is drawn as one without a picture, which the admin editor points out — while its name stays in every list of the variants ([FR-CAT-11](#fr-cat-11), [FR-CAT-13](#fr-cat-13)), marked as unavailable and moving no picture. Clearing the mark brings the pictures back as they were, with nothing uploaded again. A variant that will never be offered again is deleted instead; its pictures stay in the gallery without a label until they are removed on their own. The mark is the shop's word about what it offers, not a stock figure: the product's availability ([FR-STOCK-03](#fr-stock-03)) does not read it, and marking every variant unavailable does not put the product out of stock.

#### <a id="fr-cat-13"></a>FR-CAT-13 — Variants behind a mark where a picture is small

Where a product with variants is drawn with a picture too small to carry a label — a list item drawn as a row ([FR-CAT-06](#fr-cat-06)) and a cart line — the picture is a reminder of what the product looks like rather than the way to look at it, and the name is what is read, so the picture carries no label and the product is marked as having variants beside its other badges instead. Opening the mark, by a click or a tap, shows the variants as the product page does ([FR-CAT-11](#fr-cat-11)): the list, with the pictures beside it and not labelled on them, unavailable variants marked ([FR-CAT-12](#fr-cat-12)). It opens as a bubble beside the mark, and on a phone as a dialog, as the line note does ([FR-CART-08](#fr-cart-08)). On a cart line it is what a customer needs to state a variant in the note without leaving the cart, and it changes nothing about the line itself.

---

### <a id="fr-unit"></a>Units of Sale & Packaging (FR-UNIT)

#### <a id="fr-unit-01"></a>FR-UNIT-01 — Piece, pack and box

A product may be sold in up to three units: **piece**, **pack** and **box**. Pack and box are available for a product only where its packaging data defines them; a product with no packaging data is sold by the piece. A quantity is always a whole number of pieces; a unit is how that quantity is read and stepped, so two packs of a ten-pack box read as 0.2 bx. Changing unit changes nothing but the reading — it is exact in both directions, needs no confirmation, and a quantity typed in a unit is rounded up only to reach one the shop can supply.

#### <a id="fr-unit-02"></a>FR-UNIT-02 — Packaging data

A product's packaging is described by the number of pieces in a pack and the number of packs in a box. A box is only meaningful where a pack is defined. Both are entered and corrected in the admin panel.

#### <a id="fr-unit-03"></a>FR-UNIT-03 — Minimum order quantity

A product may define a minimum order quantity, stated in pieces. It is a floor, **not** the increment: a piece quantity moves by one pack where the minimum is a whole number of packs, and by one piece where the minimum is under a pack, since a shop selling fewer pieces than a pack holds is opening packs already; a product with no pack moves by its own minimum. The minimum must sit with the pack rather than across it — under one, or a whole number of them. It is one figure describing the goods rather than the unit they are counted in, so it holds however the quantity is read — 24 pieces is four packs of six, or a quarter of a box of 96. A quantity below it, or not a whole number of steps above it, is corrected upward and the user is told that it was, without the correction restating figures the field already shows. A change of unit corrects nothing and reports nothing ([FR-UNIT-01](#fr-unit-01)).

#### <a id="fr-unit-04"></a>FR-UNIT-04 — A price is per piece

A product's stored price is the price of one **piece**, and every other unit's price is that figure multiplied out — so no price a customer or a member of staff sees is ever rounded. Staff views of an order express each line in pieces, as the source system prices it, so an order reconciles against it.

#### <a id="fr-unit-05"></a>FR-UNIT-05 — Prices per unit on the product page

A product page displays the price per piece and, where the packaging defines them, the price per pack and per box, each labelled with the quantity it covers.

#### <a id="fr-unit-06"></a>FR-UNIT-06 — Box volume and weight in the attribute table

A product's box facts — the box's volume and weight, labelled with how many boxes they cover where that is more than one — are displayed to the customer in the same attribute table as its freetext attributes, as a contiguous group.

#### <a id="fr-unit-07"></a>FR-UNIT-07 — Choosing a unit to buy in

When adding a product to the cart the user chooses which unit to buy in; the quantity shown, the step it moves by and the price shown follow that unit, and the quantity rules ([FR-UNIT-03](#fr-unit-03)) hold whichever one is chosen. A quantity may be entered in the chosen unit to three decimal places.

#### <a id="fr-unit-08"></a>FR-UNIT-08 — Price and packaging on a list tile

A product list tile shows the per-piece price prominently and, in secondary text, the packaging summary ([FR-UNIT-09](#fr-unit-09)), the minimum piece quantity where one applies, and the pack and box prices where the packaging defines them.

#### <a id="fr-unit-09"></a>FR-UNIT-09 — Packaging summary formula

A product's packaging is summarised as a formula — "4 pk × 6 pcs = 24 pcs" — stating the pieces a box contains. Where a product has packs but no box, the summary states the pieces per pack instead. It is shown on the list tile and beside the control that chooses a unit to buy in, not as a row of the product's attribute table. Unit words are deployment-configurable abbreviations, so they read the same after any quantity.

#### <a id="fr-unit-10"></a>FR-UNIT-10 — Totals never round

Every total a customer is shown or charged is an exact whole number of minor units: a price is per piece and a quantity is a whole number of pieces, so a total is a multiplication with nothing to round — including where the quantity is read as a fraction of a unit, since the fraction describes a whole number of pieces.

#### <a id="fr-unit-11"></a>FR-UNIT-11 — Boxes a product ships as

A product may state how many boxes it ships as; the default is one. Its stated volume and weight are already the totals across those boxes, so neither is ever multiplied by it, and it affects no price, piece count or quantity rule. It is carried into the cart and order summary, where the boxes, weights and volumes of the ordered lines are added up. A line that does not fill whole boxes is estimated from the same figures through the fraction of one it does fill, with cartons rounded up to whole ones; a summary containing such a line is labelled approximate. Either way a manager confirms it.

---

### <a id="fr-stock"></a>Stock Availability (FR-STOCK)

#### <a id="fr-stock-01"></a>FR-STOCK-01 — Optional stock quantity

A product **may** carry a stock quantity in pieces; carrying none is the default and means the product's stock is not tracked. It is written by the bulk sync ([FR-ADM-02](#fr-adm-02)) and editable in the admin panel, and it is staff-facing only: the figure is never displayed to a customer nor serialized to the storefront. A stocktake correction may leave it negative, which is a valid value and is read as none in stock.

#### <a id="fr-stock-02"></a>FR-STOCK-02 — Three availability states

A product's availability is derived from that quantity in three states, and is absent for a product with no quantity: **out of stock** (zero or below), **few left** (at or below the product's low-stock threshold), **available** (above it). The threshold is the pieces in one box, falling back to one pack where the product has no box and to a deployment-configured piece count where it has neither; a product may override it with a piece figure of its own.

#### <a id="fr-stock-03"></a>FR-STOCK-03 — Availability badge

Availability is shown wherever a product's buying controls are — list tile, list row, product page and cart line — as a labelled badge. The quantity behind it is never shown. A product whose stock is not tracked shows no badge; a listing holding at least one badge reserves the space in every item, so names stay level.

#### <a id="fr-stock-04"></a>FR-STOCK-04 — Out of stock cannot be ordered

A product that is out of stock stays listed, reachable and priced, but cannot be added to the cart or ordered; checkout refuses an order containing one. **Few left** restricts nothing: a customer may order more than the threshold and the manager reviews it.

#### <a id="fr-stock-05"></a>FR-STOCK-05 — Availability orders every listing

Every storefront product listing orders by availability first — out of stock last, everything else (untracked included) ahead of it — and applies the chosen sort (name, price or relevance) within that. Availability is not offered as a sort option of its own. The admin product list is excluded: it orders by what it was asked for and narrows by availability instead ([FR-ADM-05](#fr-adm-05)).

---

### <a id="fr-set"></a>Sold-Together Sets (FR-SET)

#### <a id="fr-set-01"></a>FR-SET-01 — Mutual pairings

An admin can pair a product with other products it is sold together with (e.g. a cup and the lids that fit it). A pairing is **mutual** — pairing A with B pairs B with A — and a product may be paired with any number of others. Pairings are maintained in the admin panel only; a bulk sync neither creates nor clears them.

#### <a id="fr-set-02"></a>FR-SET-02 — When a cart satisfies a pairing

A cart satisfies a paired product when every one of its pieces can be covered by a piece of one of its counterparts in the cart, with no counterpart's pieces covering two products at once. Counting is in pieces, so six pieces of A may be answered by three of B and three of C; but ten of B cannot answer both ten of A and ten of C. The check runs over the whole cart, not at the moment of adding, because several lines can answer one pairing and each pairing is checked from both sides.

#### <a id="fr-set-03"></a>FR-SET-03 — What an unsatisfied pairing offers

Where a cart leaves a pairing unsatisfied, the cart says which product is short and by how much, lists the products that would answer it, and offers to add them without leaving the cart.

#### <a id="fr-set-04"></a>FR-SET-04 — Advisory unless configured as enforced

An unsatisfied pairing is advisory and does not prevent checkout. A deployment can configure pairings as enforced, in which case checkout refuses an unsatisfied cart and says which pairing it refused on.

#### <a id="fr-set-05"></a>FR-SET-05 — Pairing marker on buying controls

A paired product is marked wherever its buying controls are; the marker opens its counterparts with their own buying controls, so they can be added from where the marker was pressed.

---

### <a id="fr-doc"></a>Product Documents (FR-DOC)

#### <a id="fr-doc-01"></a>FR-DOC-01 — Uploading a document

An admin can upload documents — certificates, declarations, data sheets — as PDF or image files. A document has a title, an optional issue date, an optional expiry date and one file, or a link in place of the file ([FR-DOC-05](#fr-doc-05)). Replacing the file keeps the document, its dates and its product links, which is how a re-issued document supersedes the one it replaces.

#### <a id="fr-doc-02"></a>FR-DOC-02 — Linking documents to products

A document is linked to any number of products, and a product may carry any number of documents. The links are edited from both sides: the document's own form picks products from the catalogue, searchable and filterable by category, and takes several at once; a product's form lists the documents on it, links back to them, and adds or removes one at a time.

#### <a id="fr-doc-03"></a>FR-DOC-03 — Documents on the product page

A product page lists the documents linked to that product as links that open the file in a new browser tab, or the document's link where it has one ([FR-DOC-05](#fr-doc-05)). A document whose expiry date has passed is not listed. Listings do not show documents.

#### <a id="fr-doc-04"></a>FR-DOC-04 — Expiry states in the admin list

The admin document list states each document's expiry state — valid, expiring within 30 days, expired — and can be filtered by it. Documents already expired and documents about to expire are each work awaiting the admin ([FR-WORK-02](#fr-work-02)), counted apart; the state clears when the document is given a current file and expiry, or is deleted.

#### <a id="fr-doc-05"></a>FR-DOC-05 — A document held elsewhere

A document can carry a link to where it is held outside the shop, such as its entry in a public register or the issuer's own page. A document has a file, a link, or both, and never neither: a register entry is a document whether or not anyone has its file. The link is a full web address. On the product page, a document with only a link opens it, and one with both opens its file from the title and offers the link beside it, named by the site it leads to. The admin list names the link's site beside the file and finds a document by it. Removing the file from a document that has a link leaves the link as the document. A document's dates, expiry states and product links are the same whichever it has.

---

### <a id="fr-search"></a>Search (FR-SEARCH)

#### <a id="fr-search-01"></a>FR-SEARCH-01 — Search bar in the header

A product search bar is available in the site header on every page.

#### <a id="fr-search-02"></a>FR-SEARCH-02 — Matching on product name

Search matches on product name and on category name. Matching is word-order independent and tolerates minor typos (fuzzy matching). The two are never mixed into one ranking: a query answers with the products it matched, and names the categories it matched beside them ([FR-SEARCH-07](#fr-search-07)).

#### <a id="fr-search-03"></a>FR-SEARCH-03 — Results ordered by relevance

Search results are ordered by relevance (match score), best match first.

#### <a id="fr-search-04"></a>FR-SEARCH-04 — Sort controls and shareable URLs

Product listings offer sort controls (name, price). Search results additionally offer relevance, and default to it. A listing with subcategories — a category's, or the catalogue index ([FR-CAT-02](#fr-cat-02)) — additionally offers ordering by category, and defaults to it: products grouped in the order the category tree is arranged in, a category's own products before its subcategories', by name within each group. A listing without subcategories defaults to name. Every sort is applied within availability ([FR-STOCK-05](#fr-stock-05)) — the grouped order within each group. A deployment can hide the sort controls; the URL parameters keep working and the default order is unchanged. The chosen sort and page are part of the URL, so a listing view can be shared and restored.

#### <a id="fr-search-05"></a>FR-SEARCH-05 — Type-ahead suggestions

As a query is typed into the search bar, a short list of matching product names is suggested; picking one goes straight to that product. Suggestions are an accelerator only — the full result list stays reachable by submitting the query.

#### <a id="fr-search-06"></a>FR-SEARCH-06 — What a suggestion shows

A product suggestion carries the product's picture and its price beside its name, as a list item does — the price the viewer is charged ([FR-AUTH-05](#fr-auth-05)) and stated as a listing states it ([FR-UNIT-08](#fr-unit-08)). A suggestion list is scanned rather than read, and a row of bare names makes a shopper open pages to tell two products apart. A suggestion can also put its product in the cart, as the smallest order it takes, without leaving the field — so a cart can be filled from one query; the unit, the quantity and the note are settled in the cart.

#### <a id="fr-search-07"></a>FR-SEARCH-07 — Categories among the suggestions

Categories the query matches ([FR-SEARCH-02](#fr-search-02)) are suggested as their own short group, ahead of the products, and picking one opens that category's listing. A category matches only where every word of the query matches its name — a query that merely shares a word with a category does not name it — and each is shown with the category it sits in, since a name alone may occur in more than one branch. Only categories the storefront shows are offered ([FR-CAT-01](#fr-cat-01)). Where a query matches no category the group is absent, and the product suggestions stand alone as they do today.

#### <a id="fr-search-08"></a>FR-SEARCH-08 — Typed on the other keyboard layout

A deployment may name a second keyboard layout, for visitors who switch between two and type with the wrong one active. A query is then also read as if its keys had been pressed on that layout, and matches in either reading. Product and category search read each word on its own, so a query typed partly on each layout matches as if it had been typed right; where a word matches equally well both ways, the reading as typed ranks first, and a suggestion marks the part of its name that either reading matched. The staff search boxes — products, orders, accounts, documents — read the query the same way, the ones that match plain text reading it whole. Only key positions are read, never the sound of a word: a name spelled out in another alphabet is not a match. A deployment that names no second layout searches only what was typed.

---

### <a id="fr-attr"></a>Filterable Attributes (FR-ATTR)

#### <a id="fr-attr-01"></a>FR-ATTR-01 — Defining a filterable attribute

An admin defines the set of filterable attributes. A definition carries the attribute's name exactly as it is written in a product's attribute table, its type (text or number), and an optional unit shown after every one of its values.

#### <a id="fr-attr-02"></a>FR-ATTR-02 — A product attribute becomes filterable

A product's freetext attribute ([FR-CAT-05](#fr-cat-05)) becomes filterable when its key matches a definition's name. Matching is exact apart from surrounding whitespace and the part a set's attribute names ([FR-CAT-10](#fr-cat-10)), and product attributes are entered and corrected exactly as before — no product has to be re-entered for a definition to take effect.

#### <a id="fr-attr-03"></a>FR-ATTR-03 — Unreadable number values

A value of a number-typed attribute that cannot be read as a number is still stored and displayed unchanged; it is excluded from that attribute's filter, and the admin is told how many of a product's values are affected.

#### <a id="fr-attr-04"></a>FR-ATTR-04 — Filter panel with counts

Category listings and search results offer a filter panel listing every filterable attribute present among the products in scope, each distinct value as a checkbox with the number of products it would leave. Number-typed values are ordered numerically.

#### <a id="fr-attr-05"></a>FR-ATTR-05 — How selections combine

Selecting several values of one attribute matches any of them; selections across different attributes must all match. A value that would leave no products in combination with the current selection is shown disabled, not hidden.

#### <a id="fr-attr-06"></a>FR-ATTR-06 — Selection chips and reset

Every selected value is shown as a removable chip beside the listing's heading, and the whole selection can be reset at once from the filter panel.

#### <a id="fr-attr-07"></a>FR-ATTR-07 — Selection is part of the URL

The current selection is part of the URL, so a filtered listing can be shared and restored (as [FR-SEARCH-04](#fr-search-04) does for sort and page). Changing a selection returns to the first page.

#### <a id="fr-attr-08"></a>FR-ATTR-08 — Attribute links from a product page

On a product page, an attribute that is filterable is shown as a link to that product's own category, filtered to that value.

#### <a id="fr-attr-09"></a>FR-ATTR-09 — Attribute registry and renaming

The admin panel lists every attribute key and value in use across the catalog, defined or freetext, with usage counts, and can list the products carrying a given key or value. It can rename a key or a value across all products at once. Renaming is the correction path: attribute text is matched exactly, so a typo is visible here rather than silently merged.

#### <a id="fr-attr-10"></a>FR-ATTR-10 — Attribute names offered while typing

While a product's attributes are being entered, the admin is offered the attribute names already in use across the catalog, with their usage counts, and can add a row for one without retyping it.

#### <a id="fr-attr-11"></a>FR-ATTR-11 — A category's own attribute list

A category defines which filterable attributes its listing offers and in what order. A category with no definition of its own follows its nearest ancestor that has one, and one with no ancestor either offers every filterable attribute in the registry's order. A category's own list replaces the inherited one entirely, so an attribute declared afterwards is offered only where nothing has been defined. An attribute a category does not offer is not linked from its products' attribute rows either.

#### <a id="fr-attr-12"></a>FR-ATTR-12 — The catalogue's own attribute list

The catalogue index ([FR-CAT-02](#fr-cat-02)) offers only the filterable attributes chosen for it, in the order chosen — typically the few that run across categories, such as a brand, so products of one brand can be found together wherever they are filed. Nothing is offered there until it is chosen: the whole catalogue carries every attribute there is, and offering them all would open the page on a long panel. The list stands alone — no category inherits it, and a category's own list ([FR-ATTR-11](#fr-attr-11)) is unaffected by it. Search results keep offering every filterable attribute, and a product's attribute rows keep linking to its own category's listing.

#### <a id="fr-attr-13"></a>FR-ATTR-13 — Subcategories under a selection

A listing's subcategories — the top-level categories on the catalogue index — carry the current selection into their own listing, but only the part of it their own list offers ([FR-ATTR-11](#fr-attr-11)). A subcategory that part leaves without products is shown greyed, as a filter value with no matches is ([FR-ATTR-05](#fr-attr-05)); it still leads to its listing, unfiltered.

---

### <a id="fr-adm"></a>Admin & Catalog Sync (FR-ADM)

#### <a id="fr-adm-01"></a>FR-ADM-01 — Editing a product by hand

Admin can add, modify, and delete individual products via the admin panel, and publish or unpublish them ([FR-ADM-06](#fr-adm-06)).

Removing a product goes in steps: unpublish it, delete it, and where [FR-ADM-21](#fr-adm-21) allows, delete it permanently. Only an unpublished product can be deleted; a live product offers no delete action, only unpublishing. Deleting hides the product without erasing it and asks for no confirmation, because restoring it undoes it in one step. Restoring leaves the product's publication as it was. A deleted product is shown as deleted only, not also as unpublished.

#### <a id="fr-adm-02"></a>FR-ADM-02 — Bulk catalog sync

Admin can trigger a bulk sync (file upload or endpoint) that upserts products by their catalogue ID and deletes products missing from the source. A product that returns to the source is restored only if a run deleted it; one an admin deleted stays deleted. A run states which fields it writes — all of them, or a subset such as prices only or stock only — so an export that does not carry a field cannot blank it. Intended for periodic price and stock updates. The upload is refused while an external system owns the catalog ([FR-ADM-10](#fr-adm-10)).

#### <a id="fr-adm-03"></a>FR-ADM-03 — Editing static pages

Admin can edit the rich-text content of a fixed set of static pages (about, terms, conditions, privacy, imprint, etc.) via the admin panel. Pages cannot be created or deleted; navigation, layout, and interactive elements (forms, embeds) are part of the application, not editable content. Every save keeps a version, and the admin can read a page's earlier versions in the editor. The pages a reader may hold the shop to — terms, conditions, privacy, imprint, withdrawal and the consent texts — say under their text when it last changed. They show the date, not the version number, since a version counts every save, typo fixes included.

#### <a id="fr-adm-04"></a>FR-ADM-04 — Maintenance mode

Admin can toggle a site-wide maintenance mode from the admin panel. While active, the shop is open to staff only: the public storefront (catalog, product, and static pages) and its read APIs are unavailable to visitors and crawlers — served with an HTTP 503 status and a minimal maintenance notice — and customers can neither sign in nor reach their account, which tells them the shop is closed rather than that their password was wrong. Staff sign in as usual and see the storefront as it will open.

#### <a id="fr-adm-05"></a>FR-ADM-05 — Admin product list

The admin product list can be filtered by publication state (live and unpublished together, live only, unpublished only, or deleted, which [FR-ADM-22](#fr-adm-22) keeps apart), by category and by an attribute key or key/value pair, by availability ([FR-STOCK-02](#fr-stock-02)), by what its content lacks or carries ([FR-ADM-20](#fr-adm-20)), searched by name or by the private sync key, and sorted (name, price, most recently updated). It shows each product's stock figure ([FR-STOCK-01](#fr-stock-01)) in the badge its availability colours — the state alone answers whether a product can be sold, and restocking asks how many. Like every admin list, it says how many records match what narrows it, across all its pages, so a filter is judged by what it leaves rather than by one page of it.

#### <a id="fr-adm-06"></a>FR-ADM-06 — Publication gate

A product is not visible to the public until an admin publishes it. Products created by the bulk sync arrive unpublished, so new items are reviewed — their price, their category and the packaging the sync does not carry — before they can be seen or bought. A product the default price list ([FR-AUTH-05](#fr-auth-05)) does not price cannot be published at all, and clearing a published product's price takes it off the storefront: a page cannot quote a price that does not exist. A price of zero is that same state, stored as no price rather than as a product that costs nothing. A pairing counts only counterparts on sale ([FR-SET-01](#fr-set-01)), so unpublishing the last one a live product is paired with leaves that product on sale with its pairing switched off; the unpublish confirmation names the products this would happen to.

An admin can open the page of a product the public cannot see: unpublished, unpriced or deleted. The page states beside the product's name why it is hidden, and offers publishing and unpublishing as the storefront's edit actions do; an unpriced product says it needs a price first. Deleting, restoring and deleting permanently are done from the admin product list, never from a storefront page. For everyone else the page does not exist, and it is never indexed.

#### <a id="fr-adm-07"></a>FR-ADM-07 — Catalog import over a machine endpoint

Where a deployment configures one, an automated source can submit the same catalog import over an authenticated machine endpoint, producing the same staged run, preview and audit record as a manual upload. A run applies itself where its effect stays within a policy the deployment declares — which counts the categories it adds and the categories it leaves empty as well as the products it creates, hides and rewrites, so a regrouping upstream is read before it lands — and is otherwise staged for an admin to review, which is work awaiting them ([FR-WORK-02](#fr-work-02)) — as is a run whose source the adapter cannot fully vouch for. A machine run is accepted while maintenance mode is active ([FR-ADM-04](#fr-adm-04)), so a deployment can be populated before it opens to the public. The manual upload stays available as the operator's fallback: it is refused only while the catalog is externally owned ([FR-ADM-10](#fr-adm-10)), which an admin can turn off without a deploy.

#### <a id="fr-adm-08"></a>FR-ADM-08 — Order exchange with the source system

Where a deployment configures one, the same automated source can read order requests and write back their processing state and adjustments, so an order can be worked entirely in that system while the platform keeps the customer's view and notifications.

Reading and writing are separate capabilities on the credential, as they are for customers ([FR-ADM-18](#fr-adm-18)). The read is not gated on ownership — a system has to see the orders that are here before anyone can hand it the work — while every write is refused unless order processing is externally owned ([FR-ADM-10](#fr-adm-10)), so the two sides never both hold the pen. An order reads outward as the version it currently stands at, naming the counterparty by the account's own key ([FR-ADM-14](#fr-adm-14)) rather than by the details its checkout happened to carry, and naming that version, so a write-back answers something rather than guessing.

A write-back says what the order now is: its state, its content and what has been recorded against it, together. It records **at most one version** for all of that ([FR-ORD-03](#fr-ord-03)) — an exchange that moved an order and changed it in the same breath is one event to the customer, not three — and it states, as a manager does, whether the customer is written to and whether their view follows it ([FR-NOTIF-03](#fr-notif-03)). An instruction that says what the order already says changes nothing and notifies nobody ([FR-ADM-16](#fr-adm-16)), because a polling source re-sends. The platform's states stay the coarse set [FR-ORD-01](#fr-ord-01) names and the source system's own vocabulary is mapped onto them outside the platform, so however many steps an order moves through over there, the customer reads the one that concerns them.

Two things a write-back does not overwrite. A customer may still call off an order nobody has answered ([FR-ORD-02](#fr-ord-02)) however orders are owned, and an instruction that arrives for an order they called off is refused rather than driving it forward over the top — the shop hears about it, and the alternative is a cancellation that silently never happened. And what the customer wrote in their own words is theirs, exactly as it is when a manager adjusts an order. A write-back is authored by the integration and never by a person: where the other system knows who acted, that name travels as a label and is never resolved to an account here.

#### <a id="fr-adm-09"></a>FR-ADM-09 — Sync activity log

The admin panel shows a log of sync activity in every area — the catalog, customers, orders — and in both directions: what ran, which way, over what, what it changed, and what failed, in enough detail to diagnose a broken or partial exchange without access to the server. An area's runs are readable, and a staged run of theirs reviewable, by whoever may do that area's work by hand: the catalog by admins, customers and orders by managers too ([FR-AUTH-03](#fr-auth-03)). Handing an area over and issuing a machine token ([NFR-SEC-09](#nfr-sec-09)) stay admin-only — they are configuration, not the work.

An automated source may attach a note to a run it did produce, kept verbatim beside it and shown whatever became of the run; it explains, and decides nothing.

It can also read one run back afterwards, in any area it may write: what the run came to, what it counted, and — where it is waiting — why it was staged rather than applied ([FR-ADM-07](#fr-adm-07)). Without it a scheduled source cannot learn that a run of its own is sitting unread, because a fresher submission supersedes the one before it: it would keep sending, keep replacing the run somebody was about to review, and never find out. The read is scoped to the **area** the credential may write rather than to the credential that submitted the run, so rotating a token does not blind a source to its own history, and a run of another area is as invisible as one that does not exist.

#### <a id="fr-adm-10"></a>FR-ADM-10 — External ownership of an area

Where an external system owns an area of the platform's data — the catalog, customers, order processing — an admin can say so from the admin panel — area by area, or for the whole shop in one switch — and take it back. The shop-wide switch is a reading of the areas and an action across them, not a setting of its own. While an area is externally owned, the fields that system writes are read-only in the admin panel and refused by the API — as is adding or removing the records it owns, except deleting and restoring a product (below) — and the platform's own way into that area — the manual bulk upload, every staff action on a customer account or an order — is refused; while it is not owned, the automated exchange for that area is refused instead.

What the shop presents rather than stocks stays the shop's however an area is owned: a product's publication and the variants its pictures show ([FR-CAT-11](#fr-cat-11)), and how its categories are named for display, pictured and arranged. Whether a product is shown at all is part of that: an admin may delete a product the source still sends, and restore it. A run never restores a product an admin deleted, and while the catalog is owned, an admin does not restore one a run deleted either: each side undoes only its own deletion. Only a product a run deleted can be deleted permanently ([FR-ADM-21](#fr-adm-21)), because one the source still sends would arrive again as new. A category the external system never named — one the shop made up, carrying no source key — stays the shop's entirely, its name included, because nothing outside writes it; giving it that key is how it joins the exchange, after which it is read-only like any other. A price list stays the shop's to name, add and remove — only the key the external system addresses it by is frozen, because that key is how its prices arrive.

Owning customers or order processing closes the admin panel's side of them completely rather than field by field: the screens stay readable — staff must be able to see what a customer sees, and the counts of work awaiting attention ([FR-WORK-02](#fr-work-02)) are read from them — but every action on them is refused, because the point of the switch is that the work is done in the owning system.

Two things stay outside it. A staff account is not a customer: who holds which role, and the administration of admin and manager accounts, stay the platform's under every setting ([FR-AUTH-03](#fr-auth-03)). And a customer's own actions are never refused — their name and phone, their password, deleting their account ([FR-AUTH-06](#fr-auth-06)), and equally placing an order and calling off one nobody has answered yet ([FR-ORD-02](#fr-ord-02)) — because the switch is about who does the shop's work, not about whether a person may use the shop. An owned order area therefore still acquires orders and still loses them to a cancellation, which is a fact the exchange has to read rather than a conflict to resolve ([FR-ADM-08](#fr-adm-08)).

Only an admin may change the setting; it takes effect without a deploy, and every change to it — and to maintenance mode ([FR-ADM-04](#fr-adm-04)) — is recorded with who made it and shown in the admin panel.

#### <a id="fr-adm-11"></a>FR-ADM-11 — Customer exchange over the machine endpoint

Where a deployment configures one, the automated source can do, over the machine endpoint, everything a manager can do to a customer account in the admin panel — invite an account into being, approve or refuse a registration, set its tier and company details, deactivate and reactivate it — so a deployment can be run without anybody opening the admin panel. Orders are worked over the exchange under [FR-ADM-08](#fr-adm-08) instead; the account is what has to exist first, so that an exported order names a counterparty rather than inventing one.

#### <a id="fr-adm-12"></a>FR-ADM-12 — Bulk customer import

Admin can bulk-import customer details from a file, producing the same staged run, preview and audit record as a catalog upload ([FR-ADM-02](#fr-adm-02)) and reaching no further than [FR-ADM-11](#fr-adm-11) does: it may invite accounts into being and set what a manager could set, and it issues no credential. It exists for the case the automated exchange does not cover — a deployment going live with customers whose tiers are already settled elsewhere — and, like the catalog upload, it is refused while customers are externally owned ([FR-ADM-10](#fr-adm-10)).

#### <a id="fr-adm-13"></a>FR-ADM-13 — The exchange issues no credential

An account the exchange asks for ([FR-ADM-11](#fr-adm-11)) is created in the platform's own invited state, and the set-a-password link is sent from here to the person themselves, as it is on a manager's approval ([FR-AUTH-01](#fr-auth-01)). The exchange cannot set a password and cannot delete an account.

#### <a id="fr-adm-14"></a>FR-ADM-14 — Accounts are matched by their source key

Every customer account carries a private `sourceId` — the source system's own key, and the only identity the platform models for it, as for a product ([FR-ADM-02](#fr-adm-02)). An account is never matched by email address or company registration id, both of which a person can change and two people can share.

The one exception is the moment an account first acquires a key, which is what [FR-ADM-17](#fr-adm-17) governs: an account that has none has no identity to match on yet, and matching it by address once is how it gets one. Afterwards it is matched by the key exactly as stated above. An admin can also set, correct and clear the key by hand, as they can a product's; only an admin can, and — like every other write to a customer account — not while an external system owns them ([FR-ADM-10](#fr-adm-10)).

#### <a id="fr-adm-15"></a>FR-ADM-15 — The account holder's own data travels outward only

What an account holder maintains themselves — their name, their phone number, their password, and the deletion of their own account ([FR-AUTH-06](#fr-auth-06)) — travels outward only and is never written from outside. An account the person has deleted is reported as withdrawn rather than deleted on the exchange's say-so, and keeps its `sourceId` when the rest of it is cleared, so a run asking for that customer again is refused rather than obeyed: a deletion the next run could undo is not a deletion.

#### <a id="fr-adm-16"></a>FR-ADM-16 — A repeated instruction changes nothing

An instruction arriving over the machine endpoint that repeats or is out of date changes nothing and notifies nobody, in every area ([FR-ADM-07](#fr-adm-07), [FR-ADM-08](#fr-adm-08), [FR-ADM-11](#fr-adm-11)). A run that acts on many accounts at once sends each person affected the same single notification the equivalent manual action would.

#### <a id="fr-adm-17"></a>FR-ADM-17 — Claiming an account registered on the shop

Registering is the person's own act and stays open however customers are owned ([FR-ADM-10](#fr-adm-10)), so a shop whose customers are owned can acquire accounts the owning system has never heard of and cannot address. A customer run may therefore claim such an account: where its key is unknown and the shop holds an account with that email address and no key of its own, the run adopts that account instead of refusing the row or creating a second one beside it.

It is a per-run option, off unless the run asks for it, and what it does appears in the preview as its own kind of change rather than as an ordinary edit — the deployment says how many claims a run may make before a person has to read it, and none by default. A claim happens once per account; from then on the key is the identity ([FR-ADM-14](#fr-adm-14)). Staff accounts and accounts the person has closed are never claimed, and where the option is off the row is refused in terms that say an unclaimed account is what was found, not that the address is taken.

A row may name the account it claims by the platform's own identifier instead of by an address. That identifier is the only handle a keyless account has, and it is precisely what the outward read hands out ([FR-ADM-18](#fr-adm-18)), so a source system that has read the shop's accounts and decided about one can say which it means rather than asking the platform to infer it. It is the stronger of the two, since the platform issued it and nobody typed it in — but it is no safer against the mistake that matters, a local mapping pointing at the wrong account, so it is **counted under its own ceiling** rather than the address one. That is what lets a deployment allow identifier claims freely and still make every address match wait for a person. The rest is unchanged: the same accounts are out of reach, a claim still happens once, and an identifier naming no account at all is refused as such rather than as a claim that was not permitted.

#### <a id="fr-adm-18"></a>FR-ADM-18 — Reading customer accounts outward

The source system can read the shop's customer accounts over the machine endpoint — their source keys where they have them, their state, the details the account holder maintains, and the price list each is charged ([FR-ADM-15](#fr-adm-15)). Without it a person who registers on the shop is invisible to the system that is supposed to decide about them, and the account details the exchange is documented as sending outward would never leave.

It reads whether or not an external system owns customers, because the case it exists for is the one where it does not yet. Staff accounts are never included ([FR-ADM-10](#fr-adm-10)). An account the person has deleted is reported as withdrawn and carries nothing but its keys and its dates ([NFR-LEGAL-08](#nfr-legal-08)). The reading is its own capability on the credential, separate from the one that writes.

#### <a id="fr-adm-19"></a>FR-ADM-19 — A category counts its subtree

Wherever the admin panel counts a category's products, it counts everything beneath it — its subcategories included — as the storefront listing does ([FR-CAT-02](#fr-cat-02)), so the two never disagree about what belongs to a category. Filtering the admin product list by a category reads the same way. Where a category holds products directly **and** has subcategories, the list additionally offers the ones held directly by it: a product filed in a parent rather than in one of its children is otherwise invisible in a list of hundreds, and moving it is the point of finding it. The delete guard is unaffected — a category is blocked from deletion by what it holds itself and by having children at all ([FR-ADM-01](#fr-adm-01)), which is a different question from how many products are beneath it. A category with no live product beneath it is marked as one the storefront does not show, because the storefront leaves it out of its navigation.

#### <a id="fr-adm-20"></a>FR-ADM-20 — Finding what a product's content lacks

The admin product list ([FR-ADM-05](#fr-adm-05)) can be narrowed by what a product's own content lacks: a price, a picture, a description, an attribute, its packaging ([FR-UNIT-02](#fr-unit-02)), or both its box volume and weight. The first four make a product **incomplete**, because every product page shows them, and a product without a price cannot be published at all ([FR-ADM-06](#fr-adm-06)). Incomplete is a choice of its own that matches a product lacking any of the four, and each row names in words what keeps it incomplete, so the narrowed list is a queue that says what to do next. Packaging and box facts can be asked about but never make a product incomplete, because a product sold by the piece rightly has neither. A description holding only empty markup counts as missing.

The list can equally be narrowed by what a product carries beyond its name and price: the featured mark ([FR-CAT-09](#fr-cat-09)), parts of a set ([FR-CAT-10](#fr-cat-10)), variants ([FR-CAT-11](#fr-cat-11)), products it is sold together with ([FR-SET-01](#fr-set-01)), documents ([FR-DOC-02](#fr-doc-02)) or a line note ([FR-CART-08](#fr-cart-08)). Each of these has one glyph, used wherever the admin panel refers to it: on the product's row under its name, on the filter that asks for it, and on the editor section that sets it. The glyph is named in words for anyone who cannot see it. All three places list the features in one order, and in the editor each feature is a box of its own after the product's own facts, open where the product uses it and shut where it does not. Every gap and every feature is a separate choice, all in view at once, and the choices made must all hold, so "featured, without a picture" is one question.

#### <a id="fr-adm-21"></a>FR-ADM-21 — Deleting a product permanently

An admin can delete a deleted product permanently, removing it with everything that belongs only to it: its prices, attributes, pairings and document links. Its picture files are not removed at once; the regular clean-up of unreferenced uploads removes them later. It is refused for a product that has ever been ordered, which stays deleted instead. While the catalog is externally owned, it is also refused for a product an admin deleted ([FR-ADM-10](#fr-adm-10)). Its slug and source key become free again. It asks for confirmation, because it cannot be undone.

#### <a id="fr-adm-22"></a>FR-ADM-22 — Deleted products are kept apart

A deleted product is out of the catalog, so the admin panel leaves it out of every count and every list unless deleted products are asked for. The product list ([FR-ADM-05](#fr-adm-05)) shows deleted products only as a state of their own, and every other filter applies there as it does elsewhere, so "deleted, without a picture" is still one question. A category's product count ([FR-ADM-19](#fr-adm-19)), a document's product count ([FR-DOC-02](#fr-doc-02)) and an attribute's usage count ([FR-ATTR-09](#fr-attr-09)) leave deleted products out, so each agrees with the list it opens. Beside each of them the panel says how many of those products are unpublished, and that figure leads to the list narrowed to them: a count is otherwise read as what customers see. What exists on its own stays listed when only deleted products are left with it, with a count of none: a category, a document, and a filterable attribute the shop declared ([FR-ATTR-01](#fr-attr-01)). What exists only because products carry it does not: the attribute inventory ([FR-ATTR-09](#fr-attr-09)) leaves out a key or value that only deleted products carry. A search that matches no product in the catalog but matches deleted ones says how many it matched and leads to them, with the search kept: a product looked up by name would otherwise seem not to exist. The products an admin is shown under a category on the storefront in edit mode, because customers cannot see them, are its unpublished ones; a deleted product is restored from the product list, as [FR-ADM-06](#fr-adm-06) says.

Where an action also reaches deleted products, it says so. Renaming an attribute rewrites the deleted products that carry it too, because a restored product must carry the new name, and the rename says how many deleted products it touches. A category that still holds deleted products cannot be deleted, because they still belong to it. The refusal says how many there are, and moving the category's products to another one moves them too. Deleting them permanently ([FR-ADM-21](#fr-adm-21)) is the other way out. While the catalog is externally owned, the move is refused like any other change to a product's category ([FR-ADM-10](#fr-adm-10)), so a category holding products that were ordered before the source dropped them stays. It is still the shop's to rename, re-slug and move aside. A deleted product keeps its document links, and a document's form marks it as deleted.

#### <a id="fr-adm-23"></a>FR-ADM-23 — Deleting an account on the person's request

An admin can delete an account on the person's request. Such a request can reach the shop by letter, email or phone rather than through the account, and the person may no longer be able to sign in to delete it themselves. It is the same deletion as the holder's own ([FR-AUTH-06](#fr-auth-06)): the account is anonymized, its past orders are kept with the personal details removed from them, and the person receives the same confirmation. The admin states why, either the person's request or a withdrawn consent ([NFR-LEGAL-09](#nfr-legal-09)), and the reason is recorded with the deletion ([NFR-LEGAL-12](#nfr-legal-12)). It cannot be undone, so it is an admin's alone and asks for confirmation. An admin cannot delete their own account this way, and the last admin cannot be deleted. A registration nobody has decided on is declined instead ([FR-AUTH-11](#fr-auth-11)), which already removes it and ends its consent. It works while an external system owns customer accounts, because the person's right outranks the ownership switch, and the account is reported outward as withdrawn, as one its holder deleted is ([NFR-LEGAL-08](#nfr-legal-08)).

---

### <a id="fr-auth"></a>Accounts, Roles & Pricing (FR-AUTH)

#### <a id="fr-auth-01"></a>FR-AUTH-01 — Sign-up and approval

A user signs up with the details a human needs to judge the request — name, email address, phone number, and for a business its registered company name and registration id, both required; the account requires admin/manager approval before use. On approval a customer tier is assigned (not visible to the user) and the account is invited, by a single-use link, to choose its own password. Where an external system owns customers ([FR-ADM-10](#fr-adm-10)) the approval and the tier arrive from it instead of from a manager; the link is still issued and sent from here.

#### <a id="fr-auth-02"></a>FR-AUTH-02 — Password reset

Users can request a password reset via email.

#### <a id="fr-auth-03"></a>FR-AUTH-03 — Three roles

Three roles exist: **admin** (full access: products, users, and role assignment), **manager** (views all users and orders, approves registrations, assigns customer tiers), **user** (browses, sees tier-based prices once assigned, and places orders). Role is authorization only; customer tier is an independent pricing attribute of `user` accounts.

#### <a id="fr-auth-04"></a>FR-AUTH-04 — Manager account administration

Manager can view all registered users, approve pending registrations, and assign or change a user's customer tier. Manager can also deactivate an approved account — ending its sessions, while leaving the password it holds alone — and reactivate it later, which returns it to the state it was in: usable with the password its owner already chose, or awaiting one where they never chose it. Neither direction notifies the account holder. A manager may also send an account a way back in — the invitation while it has no password, the reset link once it has — for somebody who asks the shop instead of using the form ([FR-AUTH-02](#fr-auth-02)). Changing a user's **role** is admin-only.

#### <a id="fr-auth-05"></a>FR-AUTH-05 — Tier to price-list mapping

Prices shown are determined by the user's tier via a tier → price-list mapping. Exactly one price list is the **default**: guests, staff and users without an assigned tier are charged it, and a list a customer's tier does not price falls back to it. Which list that is, is an admin decision that can be moved between lists; products the newly chosen list does not price leave the storefront ([FR-ADM-06](#fr-adm-06)).

#### <a id="fr-auth-06"></a>FR-AUTH-06 — Deleting your own account

A user can delete their own account. Deletion removes personal data; past orders are anonymized, not deleted, to preserve order history.

#### <a id="fr-auth-07"></a>FR-AUTH-07 — Admin login gate

Admin-panel routes and endpoints are gated by an authenticated admin login with server-side role checks. A minimal variant (single seeded admin account, credentials provisioned via deployment configuration) is deliverable before full account management ([FR-AUTH-01](#fr-auth-01)…[06](#fr-auth-06)) exists.

#### <a id="fr-auth-08"></a>FR-AUTH-08 — Changing your own password

Any signed-in account can change its own password, confirming the current one. A successful change ends that account's other sessions. An account whose password it did not choose itself — provisioned by deployment configuration ([FR-AUTH-07](#fr-auth-07)) — is prompted to set its own before continuing.

#### <a id="fr-auth-09"></a>FR-AUTH-09 — Company suggestions at sign-up

Where a deployment configures a provider, typing a company's name or registration id suggests matching companies and fills both fields from the one chosen. The suggestion is an aid, never an authority: it does not gate submission, a deployment with no provider — or one whose provider is unavailable or out of quota — takes both fields as ordinary typed input, and what the user submits is what is stored and reviewed.

#### <a id="fr-auth-10"></a>FR-AUTH-10 — Registered address as first address

Where a chosen company suggestion carries a registered address and identifies a legal entity, the account is created with that address as its first saved address. It is an ordinary saved address once the account is active — visible, editable and removable by its owner — and it is never created from the registered address of an individual, which is a personal address rather than a business one.

#### <a id="fr-auth-11"></a>FR-AUTH-11 — Declining a registration

A registration can be declined rather than left waiting ([FR-WORK-02](#fr-work-02)). Declining removes it with the details it carried, since the account was never usable and keeping a stranger's name and number has no purpose. It cannot be undone, so it asks for confirmation. A registration that was approved is never removed this way: an account that has been used is anonymized instead ([FR-AUTH-06](#fr-auth-06)).

---

### <a id="fr-cart"></a>Cart & Checkout (FR-CART)

#### <a id="fr-cart-01"></a>FR-CART-01 — Cart summary in the header

A cart icon/summary is shown in the header.

#### <a id="fr-cart-02"></a>FR-CART-02 — Editing cart lines

Users can add, adjust quantity of, change the unit of, or remove cart items. Cart contents are paginated. A product occupies exactly one line; adding it again adds to that line, whichever unit either was chosen in. Changing a line's unit only changes how its quantity is read ([FR-UNIT-01](#fr-unit-01)) — nothing is rounded and nothing is confirmed. A product that is out of stock cannot be added ([FR-STOCK-04](#fr-stock-04)).

#### <a id="fr-cart-03"></a>FR-CART-03 — Guest checkout

Unauthenticated users can check out as a guest, providing email, name, and phone number.

#### <a id="fr-cart-04"></a>FR-CART-04 — Payment method at checkout

Checkout submits the cart as an order request for manager review, with a choice of cash on delivery or pickup, bank transfer, or card payment. The party being invoiced decides which are offered: bank transfer invoices a legal entity, so it needs a company, and neither cash nor a card arranged offline is taken from one — a company is invoiced. A company's name and registration number come from the account or are entered at checkout. Cash and card payment require no upfront data. The method is recorded at checkout; nothing is charged there.

#### <a id="fr-cart-05"></a>FR-CART-05 — Payment document for bank transfer

For bank transfer orders, the manager attaches the shop's payment document — a PDF, or a scan of one — to the order; it is viewable on the order and emailed to the customer ([FR-ORD-05](#fr-ord-05)).

#### <a id="fr-cart-06"></a>FR-CART-06 — Online card payment

Where a deployment configures an online card provider, card payment is offered only after an order has been accepted, and a successful payment records the order as paid without a manager. Cash, bank transfer, and card arranged offline are recorded as paid by a manager ([FR-ORD-04](#fr-ord-04)).

#### <a id="fr-cart-07"></a>FR-CART-07 — Delivery, pickup and preferred date

At checkout, the user chooses delivery or self-pickup. Delivery states its zones and their rules, self-pickup lists the points an order may be collected from, each with an address and a link to a map; both come from deployment configuration, and the collection points are their own list — goods may be handed over at a warehouse rather than at an office that takes enquiries. A zone may state a minimum order total for free delivery, or that the deployment does not deliver there at all; the zone is resolved from the entered address and the checkout says which applies, whether the order meets it, and what to do instead where it is not delivered to. This is advisory throughout — it never blocks an order and no delivery price is computed; a manager answers every order either way. Whether an order carries an invoice address of its own is deployment configuration: where it does, one is asked for however the goods travel, since it is a property of the party being invoiced; where it does not, a delivery gives the one address it needs and a collected order gives none. The user may state a preferred date, which is a wish recorded with the order — offered as working days from the next one onwards, since a day nobody can work is not a wish a manager can act on; scheduling itself is coordinated manually between user and manager (email/phone), not automated.

#### <a id="fr-cart-08"></a>FR-CART-08 — Free-text note on a cart line

A product may enable a free-text note on its cart line, for goods whose variant (e.g. colour) is stated in words rather than carried by a separate article. The note is off by default; where enabled it is optional, never required, and a per-product prompt says what to state. It describes the line as a whole and a product in a given unit is always one line. It is copied onto the order line and into the order emails. Where the product names its variants, the customer sees them on its pictures and from a mark on the cart line ([FR-CAT-11](#fr-cat-11), [FR-CAT-13](#fr-cat-13)), but choosing one is still a matter of saying so in the note.

#### <a id="fr-cart-09"></a>FR-CART-09 — Party the order is invoiced to

At checkout the user states which party the order is **invoiced** to: the one their account is registered as, another person (a name), or another company (a name and a registration number, both required). It is a field of the order, held apart from the addresses — an order invoiced to one party at another's address is an ordinary order. A third-party order is priced provisionally, since the customer's price group belongs to their account rather than to the party being invoiced, and the checkout says so.

#### <a id="fr-cart-10"></a>FR-CART-10 — Cart persists between visits

The cart persists in the browser between visits for as long as its stored form remains readable. On return, the user is shown once what changed while it waited — prices that moved, items no longer available, items that went out of stock or came back into it ([FR-STOCK-04](#fr-stock-04)), quantities corrected — in a summary they can dismiss. Signing in or out re-prices the cart without reporting those changes.

#### <a id="fr-cart-11"></a>FR-CART-11 — Address suggestions at checkout

Where a deployment configures a provider, addresses are suggested while the user types and fill the address fields as structured components; checkout then asks for the street alone and shows back what the suggestion filled, with the full fields always one click away. A deployment with no provider configured draws every field from the start and takes the address as ordinary typed input.

---

### <a id="fr-ord"></a>Order Processing (FR-ORD)

#### <a id="fr-ord-01"></a>FR-ORD-01 — Order states

An order moves through a fixed set of states: awaiting an answer, accepted, ready, and completed — ending, if it does not complete, as declined or cancelled. Whether the order was changed along the way is a fact about its content ([FR-ORD-03](#fr-ord-03)), not a state of its own. A state is worded for the customer according to whether the order is collected or delivered.

#### <a id="fr-ord-02"></a>FR-ORD-02 — Moving between states

Staff move an order between states, forwards and — one step at a time — backwards: an order answered by a wrong click must not be stuck at that answer, and correcting it must not require cancelling an order that was never called off. An ended order goes back to awaiting an answer. A customer may cancel their own order only while it is awaiting an answer; after that they contact the shop. Where money has already been recorded against it, both sides are warned before the cancellation that a refund is arranged with the shop directly — the platform records payments ([FR-ORD-04](#fr-ord-04)) and never moves them. Orders are never deleted — a refused or called-off order keeps its record and states a reason, which the customer is told. Where order processing is externally owned ([FR-ADM-10](#fr-adm-10)) the moves arrive from that system instead and staff make none. Such a system reports where an order stands rather than taking a step, so it may name any active state in one move — including reopening an ended order straight to the state it reached over there — and each report records one version. What it may not do is manufacture the steps in between, refuse an order already being worked, cancel one that has been handed over, or move an order the customer called off: that cancellation is theirs and is refused however the area is owned.

#### <a id="fr-ord-03"></a>FR-ORD-03 — Accepting with adjustments

A manager accepts an order either as submitted or with adjustments, agreed with the customer outside the platform: changed quantities, removed or added lines, and corrected prices — line by line, or by re-pricing the whole order from another price list, which is what a provisionally priced third-party order needs ([FR-CART-09](#fr-cart-09)). The same adjustment covers what the checkout asked: how the order is fulfilled and where it goes, the party it is invoiced to, the payment method ([FR-ORD-04](#fr-ord-04)) and who to contact about it. What the customer wrote — their note, their line notes and their preferred date — is kept as they wrote it. An adjustment records a new version of the order and states what changed; the order keeps its reference, its link and the state it was in. It may be made wherever the order stands, including after it has ended: the platform records what the shop did. Every state change records a version too, so an order's versions are its history and any of them can be read back whole. An adjustment may equally arrive from an owning system ([FR-ADM-08](#fr-adm-08)): it is the same operation writing the same kind of version, except that two managers adjusting at once is a hazard a screen guards against by naming the version it was looking at, and a system writing back has nobody to ask — it is answered against the order as it now stands, and an instruction that says nothing new writes nothing at all.

#### <a id="fr-ord-04"></a>FR-ORD-04 — Payment tracked separately

Payment is tracked separately from fulfilment: an order is not due, awaiting payment, or paid, and a manager records payment as received, or takes that record back where it was recorded in error. An order that has been handed over and not recorded as paid is work awaiting the shop ([FR-WORK-02](#fr-work-02)), whichever way it was to be paid. Recording it may be done with the state change that is the handover, since money handed over with the goods is one event and not two. A manager may change an unpaid order's payment method, under the same party rules that applied at checkout ([FR-CART-04](#fr-cart-04)).

#### <a id="fr-ord-05"></a>FR-ORD-05 — Order documents

An order carries one document of each kind it can have: payment instructions where it is paid by bank transfer, and a summary of the order itself. The platform generates the summary; a document supplied by the operator or by an external system replaces the generated one, and removing the supplied file restores it. Which of the two may supply it follows the ownership switch ([FR-ADM-10](#fr-adm-10)) rather than being a separate permission, so exactly one side files the shop's paperwork at a time; a supplied file arrives as bytes, because what the shop prints is a real document and not something a second system could redraw from data. Documents are readable by whoever may read the order itself and by nobody else — a supplied one only once the customer's own view has reached the version it was filed against, and payment instructions only while the order owes money. Payment instructions are emailed as an attachment, both with the message that says the order is accepted and on their own whenever staff choose to send them again; the order records when that was last done. Supplying a document changes nothing about the order.

---

### <a id="fr-notif"></a>Notifications (FR-NOTIF)

#### <a id="fr-notif-01"></a>FR-NOTIF-01 — Registration email

A user receives an email on registration.

#### <a id="fr-notif-02"></a>FR-NOTIF-02 — Approval email

A user receives an email on account approval, carrying a single-use link to choose their password.

#### <a id="fr-notif-03"></a>FR-NOTIF-03 — Emailing a state change or adjustment

Every state change and every adjustment offers to email the customer, and the email goes out only where staff ask for it — with the box already ticked wherever the move is news the customer has not had, and cleared for a step back or a second pass through a state they were already told about. The email carries the order as it then stands and everything the shop has said it changed since the last one, so a change agreed by phone and the confirmation that follows it are one message. Which version the customer's own view shows and which version they were last emailed about are two separate facts, both always stated to staff: either can be brought up to date afterwards, and a message can be sent again to somebody who never received it. Only a change nobody has told them about is held back.

#### <a id="fr-notif-04"></a>FR-NOTIF-04 — New registration notifies a manager

Manager is notified by email when a new user registers, to approve the account and assign a customer tier.

#### <a id="fr-notif-05"></a>FR-NOTIF-05 — New order notifies a manager

Manager is notified by email when a new order is created.

#### <a id="fr-notif-06"></a>FR-NOTIF-06 — Order received confirmation

A customer receives an email confirming their order request was received, with a link to a read-only summary of it. A guest, having no account page, is linked to a summary that opens without signing in — their only record of the order; an account holder is linked to the order on their own account, so no link that needs no session is sent for something they can already open.

#### <a id="fr-notif-07"></a>FR-NOTIF-07 — Cancellation notifies a manager

Manager is notified by email when a customer calls off an order, carrying the reason they gave for it. Nothing else a customer does to an order needs telling: calling it off is the only move they have.

#### <a id="fr-notif-08"></a>FR-NOTIF-08 — Account closure notifies a manager

Manager is notified by email when an account closes itself ([FR-AUTH-06](#fr-auth-06)), naming what the closure left behind: the orders it anonymized stay, and stay the shop's to settle.

#### <a id="fr-notif-09"></a>FR-NOTIF-09 — Exchange health emails

The admin is notified by email about an automated exchange ([FR-ADM-07](#fr-adm-07), [FR-ADM-08](#fr-adm-08), [FR-ADM-11](#fr-adm-11)): that it has stopped working, that it is working again, that a run is waiting for a decision, and that a run brought records needing their attention. The first three are sent on a **change of state** — what the shop has already been told is not repeated — and a run a person applied themselves is not announced back to that person. **Each area is its own exchange**: its state is read against its own last run, so one area breaking or recovering says nothing about another, and its messages are worded about what it carries — a message about accounts that announced itself as a catalog update would mislead in the one line an inbox shows. The fourth message is likewise an area's own: the catalog's names products that arrived unpublished ([FR-ADM-06](#fr-adm-06)), and the customer exchange has none, because the accounts it invites are written to directly ([FR-ADM-13](#fr-adm-13)) and leave nothing on a person's desk. An area that never stages a run sends only the first two: the order exchange applies what it is sent or refuses it ([FR-ADM-08](#fr-adm-08)), so there is nothing for a person to decide and nothing to announce — but a shop hearing nothing about its orders is the case the failure message exists for, and it says what silence costs there rather than repeating what the catalog's says. A deployment may name an operator address, which receives the failure and recovery messages as well. A message that cannot be sent costs the news and not the record: what it was about is still readable in the admin panel ([FR-ADM-09](#fr-adm-09), [FR-WORK-02](#fr-work-02)).

---

### <a id="fr-work"></a>Work Awaiting Attention (FR-WORK)

#### <a id="fr-work-01"></a>FR-WORK-01 — Marker on the account control

A signed-in account is shown a marker on its account control whenever anything awaits its attention, on every page of the site.

#### <a id="fr-work-02"></a>FR-WORK-02 — What counts as awaiting attention

What awaits attention is **derived from current state**, never acknowledged or dismissed: registrations awaiting approval, products awaiting publication, products no price list prices ([FR-ADM-06](#fr-adm-06)) — counted apart, because pricing them is a different job from reviewing them, and often one for whoever maintains the source export — sync runs staged for review ([FR-ADM-07](#fr-adm-07)), documents expiring, documents already expired, orders nobody has answered, orders handed over whose payment nobody has recorded, and orders in a state that waits on the account looking. A count clears only when the work behind it is done.

#### <a id="fr-work-03"></a>FR-WORK-03 — Counts link into their section

The admin and account panels show each count beside the section that resolves it, and each count links into that section narrowed to the items it counts. There is no separate notification page.

#### <a id="fr-work-04"></a>FR-WORK-04 — Counts follow the role

Counts follow the account's role: a customer is shown only what waits on them in their own orders, counted apart because they are separate jobs — money due from them, and an order packed for them to collect; staff are shown the queues their role can act on ([FR-AUTH-03](#fr-auth-03)).

---

### <a id="fr-acc"></a>Account Self-Service (FR-ACC)

#### <a id="fr-acc-01"></a>FR-ACC-01 — Order status on the account page

A user can view the status of all their orders from their account page.

#### <a id="fr-acc-02"></a>FR-ACC-02 — Order PDF

A PDF of an order's details can be viewed or downloaded from the order at any point in its life, stating the order as the reader is entitled to see it ([FR-ORD-05](#fr-ord-05)).

---

## Non-Functional Requirements

### <a id="nfr-legal"></a>Compliance (NFR-LEGAL)

#### <a id="nfr-legal-01"></a>NFR-LEGAL-01 — Privacy policy page

A dedicated page displays the privacy policy. Every form that takes personal details points to it: the contact form, registration and checkout. The pointer is a line of information, whether or not the form also asks for consent ([NFR-LEGAL-09](#nfr-legal-09)), and never part of what a consent box says, because a privacy policy is read, not agreed to.

#### <a id="nfr-legal-02"></a>NFR-LEGAL-02 — Seller information page

A dedicated page displays mandatory seller/legal information as required by the deployment's jurisdiction (e.g. an EU-style Impressum, or an equivalent).

Where the jurisdiction requires the seller to be identifiable on the site itself and not one link away, the footer of every page also carries a seller line: the seller's legal name, registration number and a way to reach them. The line comes from the deployment's configuration, like the rest of the footer's chrome, and a deployment without it shows no line.

#### <a id="nfr-legal-03"></a>NFR-LEGAL-03 — Cookie consent

Where required by the deployment's jurisdiction, a cookie consent mechanism gates non-essential cookies.

#### <a id="nfr-legal-04"></a>NFR-LEGAL-04 — Withdrawal notice

Where the deployment's jurisdiction prescribes a withdrawal notice of its own, a page displays it: the consumer's right to withdraw from an order, the deadline and how to exercise it. A jurisdiction that only requires the return procedure to be stated leaves it in the terms of sale ([NFR-LEGAL-10](#nfr-legal-10)), so the same rules are not written twice; such a deployment does not publish this page.

#### <a id="nfr-legal-05"></a>NFR-LEGAL-05 — Data residency

Personal data is stored on infrastructure satisfying the operating business's applicable data-residency requirements, per deployment.

#### <a id="nfr-legal-06"></a>NFR-LEGAL-06 — Open-source attribution page

The open-source components delivered to the browser are attributed, with their license texts, on a dedicated page.

#### <a id="nfr-legal-07"></a>NFR-LEGAL-07 — Disclosing a transfer of account details

Where a deployment transfers account details, or the orders those accounts place, to an external system ([FR-ADM-08](#fr-adm-08), [FR-ADM-11](#fr-adm-11), [FR-ADM-18](#fr-adm-18)), the transfer is configured rather than assumed — no credential is issued with the reading capability unless somebody means it — and the privacy page names it, its purpose and the category of recipient.

#### <a id="nfr-legal-08"></a>NFR-LEGAL-08 — Deletion reaches only this platform

Deleting an account under [FR-AUTH-06](#fr-auth-06) reaches only as far as this platform — the account can no longer sign in, can no longer be written to, and its personal details are cleared here — and is reported outward as withdrawn. The platform neither erases the receiving system's own record nor claims to: that system keeps its own data under its own obligations, and the privacy page says so plainly instead of promising an erasure the shop would have to perform by hand. The source system's key for the account is deliberately retained on the cleared row ([FR-ADM-15](#fr-adm-15)), so a later run cannot recreate what the person asked to have removed; the privacy page describes the outcome in those terms rather than as anonymity it cannot deliver.

#### <a id="nfr-legal-09"></a>NFR-LEGAL-09 — Recorded consent to processing personal data

Where a deployment relies on consent for some of its processing, the shop asks for it as a statement of its own. The person sees a box that stays unticked until they tick it, worded for one purpose, with words of that sentence linking to a consent text. That text is a page of its own, read under the form that asks for it, not a passage of the privacy policy ([NFR-LEGAL-01](#nfr-legal-01)). Consent is asked per purpose, not per form, and each purpose has its own text. The platform offers two purposes. A deployment switches on those it relies on consent for, and a form whose purpose is switched on is not sent without its box. A purpose switched off asks nothing and has no text to read. That is the case wherever the jurisdiction lets the processing rest on another ground, such as the contract or the shop's legitimate interest:

- **Contact** covers handling an inquiry sent through the contact form ([FR-NAV-06](#fr-nav-06)) and replying to it.
- **Account** covers assessing a registration ([FR-AUTH-01](#fr-auth-01)) and running the account afterwards. A person who registers consents on the registration form. An account opened on somebody's behalf, whether invited by a manager ([FR-AUTH-04](#fr-auth-04)) or created by an owning system ([FR-ADM-11](#fr-adm-11)), asks on the page where its holder first chooses a password. That is the holder's first act of their own, and nobody else can consent for them before it.

Checkout asks for no consent. An order's details are processed to fulfil the order, and the order accepts the terms of sale instead ([NFR-LEGAL-10](#nfr-legal-10)).

Each text keeps every version it has been published in, together with the box wording shown beside it, so a record can be read against exactly what the person saw and ticked. Editing the text starts a new version, and an existing consent stays bound to the version it was given under.

Each consent is recorded with its purpose, the version, the server's time and whose consent it is: the account's together with its email address at that moment, or for an inquiry, the submission's and the email address or phone number given with it. The record keeps that address when the account is later deleted, since a record that names nobody proves nothing, and it goes with the record when the retention period ends. The application never changes a record. An admin can find a person's records by account, email address or phone number to answer an inspection or the person's own request. Both are the operator's to answer, so the records are an admin's alone.

A consent can be withdrawn. For the account purpose, withdrawing means deleting the account, by its holder ([FR-AUTH-06](#fr-auth-06)) or by an admin on their request ([FR-ADM-23](#fr-adm-23)). Declining a registration ends its consent in the same way, since what it was given for is over ([FR-AUTH-11](#fr-auth-11)). A withdrawal that reaches the shop any other way is entered by an admin against the record, with a note of how it arrived. A record is withdrawn once, and the withdrawal never changes either. Either way, the record keeps the time of withdrawal and is then kept for a retention period the deployment sets, as the shop's evidence of when consent was given and when it ended. A contact consent is used up once the inquiry is answered and nobody withdraws it, so its retention period runs from when it was given. After that period the record is deleted, and the deletion is recorded like any other destruction of personal data ([NFR-LEGAL-12](#nfr-legal-12)).

#### <a id="nfr-legal-10"></a>NFR-LEGAL-10 — An order accepts the terms it was placed under

A terms page states the shop's terms of sale, and anyone can read it before ordering. Submitting an order accepts the terms as they stood at that moment. Checkout says so beside the submit button and links the page; submitting is the act, so there is no box to tick. The order records which version of the terms it was submitted under, so a later edit cannot change what an earlier order accepted, and staff can see which version to hand the customer when asked. The confirmation the customer receives ([FR-NOTIF-06](#fr-notif-06)) names the date of that version. Where a jurisdiction wants the terms on a medium the customer keeps, which a link to a page that can change is not, the confirmation also carries that version as a document.

A deployment may give a short return notice, which the order summary ([FR-ORD-05](#fr-ord-05)) then prints. The paper handed over with the goods thus tells the customer in writing how to return them.

#### <a id="nfr-legal-11"></a>NFR-LEGAL-11 — The tax basis of the prices

A deployment states the tax basis its prices are quoted on. There are three: tax included, tax added on the invoice, or no tax charged. The basis belongs to the seller and not to a product, since a total that added net prices to gross ones would mean nothing. A deployment that sells to consumers quotes tax included, because a consumer is shown what they will pay. The statement appears wherever a price total is shown — the cart, checkout, the customer's order pages, the order mails and the generated order summary ([FR-ORD-05](#fr-ord-05)) — and on the conditions page. Where a jurisdiction expects a consumer price to say what it includes, a deployment also states it beside the price on the product page and once on each listing. No tax charged is said under a total, and nowhere beside a price. It is a statement, not a calculation ([ADR 0065](adr/0065-state-the-tax-basis-never-the-tax.md)). The platform works out neither the tax contained in a total nor the tax to be added to one. The shop's billing documents state that figure, and a figure calculated here could disagree with them by a rounding.

A basis that charges tax names a rate, and that rate is the deployment's default. A product may carry a rate of its own, for goods taxed at a different one. The product's rate is owned like its price. It is set in the admin editor ([FR-ADM-01](#fr-adm-01)) or by a bulk sync ([FR-ADM-02](#fr-adm-02)), and where an external system owns the catalog it arrives from there ([FR-ADM-07](#fr-adm-07)/[10](#fr-adm-10)). A product without a rate of its own is taxed at the default. Under no tax charged a product's rate is kept but is not in effect, so the rates are already in place if the shop later becomes liable for tax. While every line of a cart or an order shares one rate, the statement names it once. Once they differ, each line states its rate and the total states only the basis.

The basis and the rates can change while orders are open, through a new rate or through the shop becoming liable for tax it did not charge before. An order therefore records the basis it was submitted under and the rate of each of its lines. Everything that shows the order states those, not the current ones. The basis never changes after submission. A version of the order written later ([FR-ORD-03](#fr-ord-03)) states each line's rate as it stands when that version is written, as it re-reads a price the line does not fix, because the shop's invoice states the rate in force then. An external system reading the orders ([FR-ADM-08](#fr-adm-08)) is handed the basis and every line's rate, so it can tell net figures from gross ones without an agreement made outside the platform.

#### <a id="nfr-legal-12"></a>NFR-LEGAL-12 — A record that personal data was destroyed

The platform writes a record each time it destroys personal data, in the same moment as the destruction and never one without the other, so a shop that must prove a destruction has the evidence even if nobody thought of it at the time. These things destroy personal data here: deleting an account, by its holder ([FR-AUTH-06](#fr-auth-06)) or by an admin ([FR-ADM-23](#fr-adm-23)); declining a registration, which removes it ([FR-AUTH-11](#fr-auth-11)); deleting a consent record at the end of its retention period ([NFR-LEGAL-09](#nfr-legal-09)); and removing an order's personal details, at the end of its retention period or on a guest's request ([NFR-LEGAL-14](#nfr-legal-14)). Anonymizing an account's past orders is part of deleting the account, not a separate act.

Each record names whose data it was, in terms that still identify the person afterwards without holding the destroyed data itself: the account's id, or where no account stands behind it, the consent record's or the order's. It also states which categories of data were destroyed, why — the person's request, a withdrawn consent, a declined registration, the end of a retention period — who did it, and when. The application never changes a record. Records are kept for a period the deployment sets, and are then deleted themselves, without a record of their own.

The records are the operator's to read out, for a period, when the shop draws up its own paperwork, such as a signed statement of destruction; the platform does not produce that paperwork, and the extract is a query rather than a screen.

A stored customer sync run ([FR-ADM-11](#fr-adm-11)/[12](#fr-adm-12)) keeps what it carried and what it changed, people's contact details among them, for a day only. The run itself and its counts stay; without this, a deleted account's details would outlive the deletion in a copy nobody looks at.

#### <a id="nfr-legal-13"></a>NFR-LEGAL-13 — An account of the personal data the platform holds

The repository keeps one account of every kind of personal data the platform holds: what it is, whose it is, where it is kept, what it is held for, how long it lives and how it ends, and who outside the platform receives it. It covers the copies outside the database too — logs, backups, stored files, mail on its way out, and what the visitor's own browser keeps — because deleting a person here clears the database at once and those copies only later, and the shop has to be able to say when. Staff are covered as well as customers, since the platform's trails keep who did what.

It names kinds of recipient, not providers, and marks every point a deployment decides, such as a retention period or a consent purpose switched on, so a deployment completes it with its own providers and settings instead of rewriting it. It is what the shop writes its privacy policy ([NFR-LEGAL-01](#nfr-legal-01)) from, together with whatever its jurisdiction asks a controller to file or keep about its processing. The platform writes neither. It is kept current like the lifecycle documents: a change that adds a kind of personal data, a place it is copied to or a recipient changes this account in the same change.

#### <a id="nfr-legal-14"></a>NFR-LEGAL-14 — An order's personal details end

An order keeps the personal details it was placed with — who to contact, who is invoiced, where it goes, and the notes written on it — only as long as the shop needs them. The platform is not where the shop keeps its books: invoices and accounts live in the shop's own systems. What the order here is still needed for, once it is finished, is answering a question or a claim about it. A deployment therefore sets a retention period. Once an order has been finished for that long, its personal details are removed the way deleting an account removes them ([FR-AUTH-06](#fr-auth-06)): in every version, together with the documents supplied for it ([FR-ORD-05](#fr-ord-05)). The order itself stays, with its reference, dates, lines and totals, so the shop's figures still add up. An order is finished once it is completed, declined or cancelled and no payment is awaited on it. Its period runs from the last thing that happened to it, so an order reopened and finished again starts over. Account holders' orders are included: an account that stays open does not keep its old orders' details for good.

A guest has no account to delete, so a guest's request to have their details removed reaches the shop by letter, email or phone. An admin can remove the personal details from a guest order on that request once the order is finished. While it is still running, the shop needs them to fulfil it. The removal cannot be undone, so it asks for confirmation. An account holder's orders are not cleared one by one: deleting the account clears them all ([FR-ADM-23](#fr-adm-23)).

Each removal is recorded as a destruction ([NFR-LEGAL-12](#nfr-legal-12)), naming the account where there is one and otherwise the order. The order shows staff when its details were removed. An external system reading the orders ([FR-ADM-08](#fr-adm-08)) meets the order again with the details blank, as it does after an account is deleted.

---

### <a id="nfr-sec"></a>Security (NFR-SEC)

#### <a id="nfr-sec-01"></a>NFR-SEC-01 — HTTPS everywhere

All traffic is served over HTTPS.

#### <a id="nfr-sec-02"></a>NFR-SEC-02 — Rate-limited authentication

Authentication endpoints are rate-limited to mitigate brute-force attempts.

#### <a id="nfr-sec-03"></a>NFR-SEC-03 — Hashed passwords

Passwords are stored using a salted hash (e.g. bcrypt/argon2), never in plaintext.

#### <a id="nfr-sec-04"></a>NFR-SEC-04 — Server-side access control

Role-based access control is enforced server-side on every relevant endpoint, not only in the UI.

#### <a id="nfr-sec-05"></a>NFR-SEC-05 — Validated request payloads

All incoming request payloads are validated and unexpected fields rejected at the API boundary.

#### <a id="nfr-sec-06"></a>NFR-SEC-06 — Rate-limited order endpoints

The unauthenticated order endpoints are rate-limited: checkout submission to mitigate spam orders, and the link-opened order summary to mitigate guessing at its token.

#### <a id="nfr-sec-07"></a>NFR-SEC-07 — Rate-limited search

The public search endpoint is rate-limited, and bounds the length and term count of a query it will execute.

#### <a id="nfr-sec-08"></a>NFR-SEC-08 — Proxied address suggestions

Address suggestions are proxied by the API, never requested from the browser: the provider credential stays server-side, and the endpoint is rate-limited and bounds query length.

#### <a id="nfr-sec-09"></a>NFR-SEC-09 — Machine tokens

Machine clients ([FR-ADM-07](#fr-adm-07), [FR-ADM-08](#fr-adm-08), [FR-ADM-11](#fr-adm-11), [FR-ADM-18](#fr-adm-18)) authenticate with tokens that are stored hashed, scoped to what they may do, revocable from the admin panel, and rate-limited independently of the interactive endpoints. Reading an area out and writing it are separate capabilities on a credential, so an operator can hand over one without the other.

#### <a id="nfr-sec-10"></a>NFR-SEC-10 — Credentials kept out of logs

A credential that travels in a URL — the link-opened order summary, the set-a-password link — is not retained in access logs: the credential segment is removed before the log line is stored.

---

### <a id="nfr-seo"></a>SEO & Accessibility (NFR-SEO)

#### <a id="nfr-seo-01"></a>NFR-SEO-01 — Full content in the initial HTML

All indexable pages (catalog, product, and static pages) deliver their full content in the initial HTML response, so crawlers receive it without executing JavaScript.

#### <a id="nfr-seo-02"></a>NFR-SEO-02 — Sitemap and robots.txt

A sitemap.xml is generated from current catalog content; robots.txt is provided.

#### <a id="nfr-seo-03"></a>NFR-SEO-03 — Responsive layout

The platform displays correctly on mobile devices (responsive layout).

#### <a id="nfr-seo-04"></a>NFR-SEO-04 — Listing variants kept out of the index

Listing views that are not content in their own right — search results, and sorted, paginated or attribute-filtered variants of a category — are kept out of the index: search results are `noindex`, and sorted/paged/filtered variants declare a canonical URL.

---

### <a id="nfr-ops"></a>Operability (NFR-OPS)

#### <a id="nfr-ops-01"></a>NFR-OPS-01 — Deployment via CI/CD

Application and infrastructure are deployed via CI/CD; no manual commands are run against production.

#### <a id="nfr-ops-02"></a>NFR-OPS-02 — Separate dev and prod

Separate dev and prod environments exist with independent data, configuration and secrets — including independent session-signing keys, so a compromise of one environment does not carry into the other.

#### <a id="nfr-ops-03"></a>NFR-OPS-03 — Central logs

Application logs are centrally accessible for debugging.

#### <a id="nfr-ops-04"></a>NFR-OPS-04 — Backups and restore

Database and uploaded-media backups are taken on a defined schedule, and can be copied off the host and restored by the operator.

#### <a id="nfr-ops-05"></a>NFR-OPS-05 — Search observability

Search usage is observable centrally.

#### <a id="nfr-ops-06"></a>NFR-OPS-06 — Bounded release and downtime

Release and downtime behaviour is documented and bounded: a deploy is a brief restart of a single instance, and the operator knows how long it takes, how to tell that it failed, and how to roll back to the previous image.

#### <a id="nfr-ops-07"></a>NFR-OPS-07 — A failed sync leaves consistent state

A machine sync that fails or is interrupted leaves the platform serving its last consistent state; a partially applied run is visible as failed ([FR-ADM-09](#fr-adm-09)) and can be retried or corrected without duplicating its effects.
