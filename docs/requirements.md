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

| ID        | Requirement                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-CAT-01 | The main page displays an overview of all catalog categories.                                                                                |
| FR-CAT-02 | Products are grouped by category (incl. subcategories); this grouping is navigable.                                                          |
| FR-CAT-03 | Products within a selected category are shown as a paginated grid.                                                                           |
| FR-CAT-04 | A product list item displays SKU, an image gallery (slider), name and price, and links to the full product page.                             |
| FR-CAT-05 | A product page displays SKU, name, price, full rich-text description, an image gallery, and a table of custom attributes (e.g. color: blue). |

### Search (FR-SEARCH)

| ID           | Requirement                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| FR-SEARCH-01 | A product search bar is available in the site header on every page.                                                 |
| FR-SEARCH-02 | Search matches on product name only. Matching is word-order independent and tolerates minor typos (fuzzy matching). |
| FR-SEARCH-03 | Search results are ordered by relevance (match score), best match first.                                            |

### Admin & Catalog Sync (FR-ADM)

| ID        | Requirement                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-ADM-01 | Admin can add, modify, and delete individual products via the admin panel.                                                                                                                                                                                                               |
| FR-ADM-02 | Admin can trigger a bulk sync (file upload or endpoint) that upserts products by SKU and deletes products missing from the source. Intended for periodic price/availability updates.                                                                                                     |
| FR-ADM-03 | Admin can edit the rich-text content of a fixed set of static pages (about, conditions, privacy, imprint, etc.) via the admin panel. Pages cannot be created or deleted; navigation, layout, and interactive elements (forms, embeds) are part of the application, not editable content. |

### Accounts, Roles & Pricing (FR-AUTH)

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-AUTH-01 | A user signs up with an email address; the account requires admin/manager approval before use. On approval, a generated password is emailed and a customer tier is assigned (not visible to the user).                                                                                                                                                     |
| FR-AUTH-02 | Users can request a password reset via email.                                                                                                                                                                                                                                                                                                              |
| FR-AUTH-03 | Three roles exist: **admin** (full access: products, users, and role assignment), **manager** (views all users and orders, approves registrations, assigns customer tiers), **user** (browses, sees tier-based prices once assigned, and places orders). Role is authorization only; customer tier is an independent pricing attribute of `user` accounts. |
| FR-AUTH-04 | Manager can view all registered users, approve pending registrations, and assign or change a user's customer tier. Changing a user's **role** is admin-only.                                                                                                                                                                                               |
| FR-AUTH-05 | Prices shown are determined by the user's tier via a tier → price-list mapping. Guests and users without an assigned tier always see the lowest-tier (default) price list.                                                                                                                                                                                 |
| FR-AUTH-06 | A user can delete their own account. Deletion removes personal data; past orders are anonymized, not deleted, to preserve order history.                                                                                                                                                                                                                   |
| FR-AUTH-07 | Admin-panel routes and endpoints are gated by an authenticated admin login with server-side role checks. A minimal variant (single seeded admin account, credentials provisioned via deployment configuration) is deliverable before full account management (FR-AUTH-01…06) exists.                                                                       |

### Cart & Checkout (FR-CART)

| ID         | Requirement                                                                                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-CART-01 | A cart icon/summary is shown in the header.                                                                                                                                                                                                                                              |
| FR-CART-02 | Users can add, adjust quantity of, or remove cart items. Cart contents are paginated.                                                                                                                                                                                                    |
| FR-CART-03 | Unauthenticated users can check out as a guest, providing email, name, and phone number.                                                                                                                                                                                                 |
| FR-CART-04 | Checkout submits the cart as an order request for manager review, with a choice of bank transfer or card payment. Bank transfer requires legal-entity details (name, address, tax ID); these are saved and reusable or editable on future orders. Card payment requires no upfront data. |
| FR-CART-05 | For bank transfer orders, the manager attaches a payment PDF to the order; it's viewable on the order and emailed to the customer.                                                                                                                                                       |
| FR-CART-06 | Card payment is available only after manager approval of the order request; successful payment updates order status directly. For bank transfers, a manager updates the status manually in the account page.                                                                             |
| FR-CART-07 | At checkout, the user specifies a delivery address and preferred timing, or selects self-pickup. Delivery/pickup scheduling itself is coordinated manually between user and manager (email/phone), not automated.                                                                        |

### Notifications (FR-NOTIF)

| ID          | Requirement                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| FR-NOTIF-01 | A user receives an email on registration.                                                                  |
| FR-NOTIF-02 | A user receives an email on account approval, containing their login password.                             |
| FR-NOTIF-03 | A user receives an email whenever their order status changes.                                              |
| FR-NOTIF-04 | Manager is notified by email when a new user registers, to approve the account and assign a customer tier. |
| FR-NOTIF-05 | Manager is notified by email when a new order is created.                                                  |

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

### Security (NFR-SEC)

| ID         | Requirement                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| NFR-SEC-01 | All traffic is served over HTTPS.                                                                 |
| NFR-SEC-02 | Authentication endpoints are rate-limited to mitigate brute-force attempts.                       |
| NFR-SEC-03 | Passwords are stored using a salted hash (e.g. bcrypt/argon2), never in plaintext.                |
| NFR-SEC-04 | Role-based access control is enforced server-side on every relevant endpoint, not only in the UI. |
| NFR-SEC-05 | All incoming request payloads are validated and unexpected fields rejected at the API boundary.   |
| NFR-SEC-06 | The guest (unauthenticated) checkout endpoint is rate-limited to mitigate spam order submissions. |

### SEO & Accessibility (NFR-SEO)

| ID         | Requirement                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEO-01 | All indexable pages (catalog, product, and static pages) deliver their full content in the initial HTML response, so crawlers receive it without executing JavaScript. |
| NFR-SEO-02 | A sitemap.xml is generated from current catalog content; robots.txt is provided.                                                                                       |
| NFR-SEO-03 | The platform displays correctly on mobile devices (responsive layout).                                                                                                 |

### Operability (NFR-OPS)

| ID         | Requirement                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| NFR-OPS-01 | Application and infrastructure are deployed via CI/CD; no manual commands are run against production. |
| NFR-OPS-02 | Separate dev and prod environments exist with independent data and configuration.                     |
| NFR-OPS-03 | Application logs are centrally accessible for debugging.                                              |
| NFR-OPS-04 | Database backups are taken on a defined schedule.                                                     |
