# Requirements

Defines **what** the system does; delivery order lives in [`roadmap.md`](roadmap.md). IDs are namespaced
(`FR-<domain>-NN` / `NFR-<domain>-NN`, per ISO/IEC/IEEE 29148 practice) so new entries insert
without renumbering.

---

## Functional Requirements

### Navigation & Static Pages (FR-NAV)

| ID        | Requirement                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------- |
| FR-NAV-01 | The platform provides navigation between all defined pages.                                     |
| FR-NAV-02 | A dedicated page displays information about the company.                                        |
| FR-NAV-03 | A dedicated page displays payment and delivery conditions.                                      |
| FR-NAV-04 | A dedicated page displays contact information, including an embedded map of the company office. |
| FR-NAV-05 | Main contact information (phone, email) is displayed in the site header.                        |
| FR-NAV-06 | A contact form lets a user reach the company by email, with an optional callback phone number.  |

### Catalog (FR-CAT)

| ID        | Requirement                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-CAT-01 | The main page displays an overview of all catalog categories.                                                                                                                                                                         |
| FR-CAT-02 | Products are grouped by category (incl. subcategories); this grouping is navigable.                                                                                                                                                   |
| FR-CAT-03 | Products within a selected category are shown as a paginated grid.                                                                                                                                                                    |
| FR-CAT-04 | A product list item displays an image gallery (slider), name and price, and links to the full product page. Its price detail follows FR-UNIT-08.                                                                                      |
| FR-CAT-05 | A product page displays name, price, full rich-text description, an image gallery, and a table of custom attributes (e.g. color: blue). Prices follow FR-UNIT-05; the attribute table also carries the packaging facts of FR-UNIT-06. An attribute is stored only once it has both a name and a value; a half-filled row is dropped on save rather than refused. |

### Units of Sale & Packaging (FR-UNIT)

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-UNIT-01 | A product may be sold in up to three units: **piece**, **pack** and **box**. Pack and box are available for a product only where its packaging data defines them; a product with no packaging data is sold by the piece.                                                                                                                                                                                                                |
| FR-UNIT-02 | A product's packaging is described by the number of pieces in a pack and the number of packs in a box. A box is only meaningful where a pack is defined. Both are entered and corrected in the admin panel.                                                                                                                                                                                                                             |
| FR-UNIT-03 | A product may define a minimum piece quantity, which is also the increment. It applies to **piece** purchases only — a pack or a box is already a valid quantity. A piece quantity below the minimum, or not a multiple of it, is corrected upward to the next valid quantity, and the user is told.                                                                                                                                    |
| FR-UNIT-04 | A product's stored price may cover more than one piece (e.g. a price per 100 pieces). This basis is staff-facing only: it is never displayed to a customer and never serialized to the public API. Every price a customer sees is already resolved to the unit it is labelled with.                                                                                                                                                     |
| FR-UNIT-05 | A product page displays the price per piece and, where the packaging defines them, the price per pack and per box, each labelled with the quantity it covers.                                                                                                                                                                                                                                                                           |
| FR-UNIT-06 | A product's box facts — the box's volume and weight, labelled with how many boxes they cover where that is more than one — are displayed to the customer in the same attribute table as its freetext attributes, as a contiguous group.                                                                                                                                                                                                 |
| FR-UNIT-07 | When adding a product to the cart the user chooses which unit to buy in; the quantity rules (FR-UNIT-03) and the price shown follow the chosen unit.                                                                                                                                                                                                                                                                                    |
| FR-UNIT-08 | A product list tile shows the per-piece price prominently and, in secondary text, the packaging summary (FR-UNIT-09), the minimum piece quantity where one applies, and the pack and box prices where the packaging defines them.                                                                                                                                                                                                       |
| FR-UNIT-09 | A product's packaging is summarised as a formula — "4 pk × 6 pcs = 24 pcs" — stating the pieces a box contains. Where a product has packs but no box, the summary states the pieces per pack instead. It is shown on the list tile and beside the control that chooses a unit to buy in, not as a row of the product's attribute table. Unit words are deployment-configurable abbreviations, so they read the same after any quantity. |
| FR-UNIT-10 | Purchasable quantities are whole multiples of a product's price basis, so every total a customer is shown or charged is an exact multiple of the stored price and is never rounded. Only the informational per-piece price may be inexact; it is displayed to three decimal places, and no total is derived from it.                                                                                                                    |
| FR-UNIT-11 | A product may state how many boxes it ships as; the default is one. Its stated volume and weight are already the totals across those boxes, so neither is ever multiplied by it, and it affects no price, piece count or quantity rule. It is carried into the cart and order summary, where the boxes, weights and volumes of the ordered lines are added up.                                                                          |

### Search (FR-SEARCH)

| ID           | Requirement                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-SEARCH-01 | A product search bar is available in the site header on every page.                                                                                                                                                                                |
| FR-SEARCH-02 | Search matches on product name only. Matching is word-order independent and tolerates minor typos (fuzzy matching).                                                                                                                                |
| FR-SEARCH-03 | Search results are ordered by relevance (match score), best match first.                                                                                                                                                                           |
| FR-SEARCH-04 | Product listings offer sort controls (name, price). Search results additionally offer relevance, and default to it; category listings default to name. The chosen sort and page are part of the URL, so a listing view can be shared and restored. |
| FR-SEARCH-05 | As a query is typed into the search bar, a short list of matching product names is suggested; picking one goes straight to that product. Suggestions are an accelerator only — the full result list stays reachable by submitting the query.       |

### Filterable Attributes (FR-ATTR)

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-ATTR-01 | An admin defines the set of filterable attributes. A definition carries the attribute's name exactly as it is written in a product's attribute table, its type (text or number), and an optional unit shown after every one of its values.                                                                                                                             |
| FR-ATTR-02 | A product's freetext attribute (FR-CAT-05) becomes filterable when its key matches a definition's name. Matching is exact apart from surrounding whitespace, and product attributes are entered and corrected exactly as before — no product has to be re-entered for a definition to take effect.                                                                     |
| FR-ATTR-03 | A value of a number-typed attribute that cannot be read as a number is still stored and displayed unchanged; it is excluded from that attribute's filter, and the admin is told how many of a product's values are affected.                                                                                                                                           |
| FR-ATTR-04 | Category listings and search results offer a filter panel listing every filterable attribute present among the products in scope, each distinct value as a checkbox with the number of products it would leave. Number-typed values are ordered numerically.                                                                                                           |
| FR-ATTR-05 | Selecting several values of one attribute matches any of them; selections across different attributes must all match. A value that would leave no products in combination with the current selection is shown disabled, not hidden.                                                                                                                                    |
| FR-ATTR-06 | The filter panel can clear one attribute's selection and reset every selection at once.                                                                                                                                                                                                                                                                                |
| FR-ATTR-07 | The current selection is part of the URL, so a filtered listing can be shared and restored (as FR-SEARCH-04 does for sort and page). Changing a selection returns to the first page.                                                                                                                                                                                   |
| FR-ATTR-08 | On a product page, an attribute that is filterable is shown as a link to that product's own category, filtered to that value.                                                                                                                                                                                                                                          |
| FR-ATTR-09 | The admin panel lists every attribute key and value in use across the catalog, defined or freetext, with usage counts, and can list the products carrying a given key or value. It can rename a key or a value across all products at once. Renaming is the correction path: attribute text is matched exactly, so a typo is visible here rather than silently merged. |
| FR-ATTR-10 | While a product's attributes are being entered, the admin is offered the attribute names already in use across the catalog, with their usage counts, and can add a row for one without retyping it. |

### Admin & Catalog Sync (FR-ADM)

| ID        | Requirement                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-ADM-01 | Admin can add, modify, and delete individual products via the admin panel, and publish or unpublish them (FR-ADM-06).                                                                                                                                                                    |
| FR-ADM-02 | Admin can trigger a bulk sync (file upload or endpoint) that upserts products by SKU and deletes products missing from the source. Intended for periodic price/availability updates.                                                                                                     |
| FR-ADM-03 | Admin can edit the rich-text content of a fixed set of static pages (about, conditions, privacy, imprint, etc.) via the admin panel. Pages cannot be created or deleted; navigation, layout, and interactive elements (forms, embeds) are part of the application, not editable content. |
| FR-ADM-04 | Admin can toggle a site-wide maintenance mode from the admin panel. While active, the public storefront (catalog, product, and static pages) and its read APIs are unavailable to visitors and crawlers — served with an HTTP 503 status and a minimal maintenance notice.               |
| FR-ADM-05 | The admin product list can be filtered by publication state (all / live / unpublished / soft-deleted), by category and by an attribute key or key/value pair, searched by name or by the private sync key, and sorted (name, price, most recently updated).                              |
| FR-ADM-06 | A product is not visible to the public until an admin publishes it. Products created by the bulk sync arrive unpublished, so new items are reviewed — in particular their price basis (FR-UNIT-04) — before they can be seen or bought.                                                  |

### Accounts, Roles & Pricing (FR-AUTH)

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-AUTH-01 | A user signs up with the details a human needs to judge the request — name, email address, phone number, and for a business its registration id; the account requires admin/manager approval before use. On approval a customer tier is assigned (not visible to the user) and the account is invited, by a single-use link, to choose its own password.   |
| FR-AUTH-02 | Users can request a password reset via email.                                                                                                                                                                                                                                                                                                              |
| FR-AUTH-03 | Three roles exist: **admin** (full access: products, users, and role assignment), **manager** (views all users and orders, approves registrations, assigns customer tiers), **user** (browses, sees tier-based prices once assigned, and places orders). Role is authorization only; customer tier is an independent pricing attribute of `user` accounts. |
| FR-AUTH-04 | Manager can view all registered users, approve pending registrations, and assign or change a user's customer tier. Manager can also deactivate an approved account — ending its sessions and its password — and reactivate it later, which returns it to the invited state so its owner chooses a new password. Changing a user's **role** is admin-only.  |
| FR-AUTH-05 | Prices shown are determined by the user's tier via a tier → price-list mapping. Guests and users without an assigned tier always see the lowest-tier (default) price list.                                                                                                                                                                                 |
| FR-AUTH-06 | A user can delete their own account. Deletion removes personal data; past orders are anonymized, not deleted, to preserve order history.                                                                                                                                                                                                                   |
| FR-AUTH-07 | Admin-panel routes and endpoints are gated by an authenticated admin login with server-side role checks. A minimal variant (single seeded admin account, credentials provisioned via deployment configuration) is deliverable before full account management (FR-AUTH-01…06) exists.                                                                       |
| FR-AUTH-08 | Any signed-in account can change its own password, confirming the current one. A successful change ends that account's other sessions. An account whose password it did not choose itself — provisioned by deployment configuration (FR-AUTH-07) — is prompted to set its own before continuing.                                                           |

### Cart & Checkout (FR-CART)

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-CART-01 | A cart icon/summary is shown in the header.                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR-CART-02 | Users can add, adjust quantity of, or remove cart items. Cart contents are paginated.                                                                                                                                                                                                                                                                                                                                                                     |
| FR-CART-03 | Unauthenticated users can check out as a guest, providing email, name, and phone number.                                                                                                                                                                                                                                                                                                                                                                  |
| FR-CART-04 | Checkout submits the cart as an order request for manager review, with a choice of bank transfer or card payment. Bank transfer requires legal-entity details (name, address, tax ID); these are saved and reusable or editable on future orders. Card payment requires no upfront data.                                                                                                                                                                  |
| FR-CART-05 | For bank transfer orders, the manager attaches a payment PDF to the order; it's viewable on the order and emailed to the customer.                                                                                                                                                                                                                                                                                                                        |
| FR-CART-06 | Card payment is available only after manager approval of the order request; successful payment updates order status directly. For bank transfers, a manager updates the status manually in the account page.                                                                                                                                                                                                                                              |
| FR-CART-07 | At checkout, the user specifies a delivery address and preferred timing, or selects self-pickup. Delivery/pickup scheduling itself is coordinated manually between user and manager (email/phone), not automated.                                                                                                                                                                                                                                         |
| FR-CART-08 | A product may enable a free-text note on its cart line, for goods whose variant (e.g. colour) is stated in words rather than carried by a separate article. The note is off by default; where enabled it is optional or required, and a per-product prompt says what to state. It is part of the line's identity — the same product in the same unit with two different notes is two lines — and is copied onto the order line and into the order emails. |

### Notifications (FR-NOTIF)

| ID          | Requirement                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| FR-NOTIF-01 | A user receives an email on registration.                                                                                              |
| FR-NOTIF-02 | A user receives an email on account approval, carrying a single-use link to choose their password.                                     |
| FR-NOTIF-03 | A user receives an email whenever their order status changes.                                                                          |
| FR-NOTIF-04 | Manager is notified by email when a new user registers, to approve the account and assign a customer tier.                             |
| FR-NOTIF-05 | Manager is notified by email when a new order is created.                                                                              |
| FR-NOTIF-06 | A customer receives an email confirming their order request was received. A guest, who has no account page, has no other record of it. |

### Account Self-Service (FR-ACC)

| ID        | Requirement                                                              |
| --------- | ------------------------------------------------------------------------ |
| FR-ACC-01 | A user can view the status of all their orders from their account page.  |
| FR-ACC-02 | For completed orders, a PDF with order details can be viewed/downloaded. |

---

## Non-Functional Requirements

### Compliance (NFR-LEGAL)

| ID           | Requirement                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-LEGAL-01 | A dedicated page displays the privacy policy.                                                                                                             |
| NFR-LEGAL-02 | A dedicated page displays mandatory seller/legal information as required by the deployment's jurisdiction (e.g. an EU-style Impressum, or an equivalent). |
| NFR-LEGAL-03 | Where required by the deployment's jurisdiction, a cookie consent mechanism gates non-essential cookies.                                                  |
| NFR-LEGAL-04 | Where required by the deployment's jurisdiction, a right-of-withdrawal / cancellation page is provided for paid orders.                                   |
| NFR-LEGAL-05 | Personal data is stored on infrastructure satisfying the operating business's applicable data-residency requirements, per deployment.                     |
| NFR-LEGAL-06 | The open-source components delivered to the browser are attributed, with their license texts, on a dedicated page.                                        |

### Security (NFR-SEC)

| ID         | Requirement                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| NFR-SEC-01 | All traffic is served over HTTPS.                                                                            |
| NFR-SEC-02 | Authentication endpoints are rate-limited to mitigate brute-force attempts.                                  |
| NFR-SEC-03 | Passwords are stored using a salted hash (e.g. bcrypt/argon2), never in plaintext.                           |
| NFR-SEC-04 | Role-based access control is enforced server-side on every relevant endpoint, not only in the UI.            |
| NFR-SEC-05 | All incoming request payloads are validated and unexpected fields rejected at the API boundary.              |
| NFR-SEC-06 | The guest (unauthenticated) checkout endpoint is rate-limited to mitigate spam order submissions.            |
| NFR-SEC-07 | The public search endpoint is rate-limited, and bounds the length and term count of a query it will execute. |

### SEO & Accessibility (NFR-SEO)

| ID         | Requirement                                                                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEO-01 | All indexable pages (catalog, product, and static pages) deliver their full content in the initial HTML response, so crawlers receive it without executing JavaScript.                                                                                            |
| NFR-SEO-02 | A sitemap.xml is generated from current catalog content; robots.txt is provided.                                                                                                                                                                                  |
| NFR-SEO-03 | The platform displays correctly on mobile devices (responsive layout).                                                                                                                                                                                            |
| NFR-SEO-04 | Listing views that are not content in their own right — search results, and sorted, paginated or attribute-filtered variants of a category — are kept out of the index: search results are `noindex`, and sorted/paged/filtered variants declare a canonical URL. |

### Operability (NFR-OPS)

| ID         | Requirement                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| NFR-OPS-01 | Application and infrastructure are deployed via CI/CD; no manual commands are run against production.                             |
| NFR-OPS-02 | Separate dev and prod environments exist with independent data and configuration.                                                 |
| NFR-OPS-03 | Application logs are centrally accessible for debugging.                                                                          |
| NFR-OPS-04 | Database and uploaded-media backups are taken on a defined schedule, and can be copied off the host and restored by the operator. |
| NFR-OPS-05 | Search usage is observable centrally.                                                                                             |
