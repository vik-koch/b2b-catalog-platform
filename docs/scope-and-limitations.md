# Scope and limitations

The platform is fitted to one kind of business: a wholesaler with repeat business customers,
negotiated prices and a catalog kept in an ERP. What it does is listed in
[features.md](features.md). This page lists what it deliberately does not do, and what it
does instead.

## Not supported

<!-- prettier-ignore -->
| Not supported | Instead |
| --- | --- |
| **Online card payment** | An order is a request a manager answers, and payment is recorded rather than charged: cash, bank transfer, or a card payment arranged with the shop. Online card payment waits until the shop is live and has a merchant account ([FR-CART-06](requirements.md#fr-cart-06)). |
| **Tax calculation** | The shop states whether its prices include tax, exclude it or carry none, with a rate per product. The invoice states the tax, and a figure only the platform computed could disagree with it ([ADR 0065](adr/0065-state-the-tax-basis-never-the-tax.md)). |
| **Shipping costs and courier integration** | Delivery zones state their rules and free-delivery thresholds, and checkout says which applies. A manager confirms every order and arranges delivery with the customer. |
| **Per-customer prices, discounts and promotions** | A customer is on a tier, and each tier has its own price list. A one-off deal is agreed with the customer and written into that order by a manager, who can change any line or re-price the whole order. |
| **Public article numbers** | A product is identified by its URL. The ERP's key is private: it is how the exchange finds a product, and the storefront never shows it. |
| **Several categories per product** | Every product is in exactly one category. Attributes and filters cut across categories. |
| **Variants with their own price or stock** | Sizes that are priced or stocked apart are separate products. An assorted article names its variants on its pictures, and the customer states a choice in a note on the cart line ([ADR 0064](adr/0064-a-variant-is-a-name-on-a-picture.md)). |
| **More than one language or currency per shop** | Each deployment speaks one language, set by its configuration, and nothing in the code is tied to a particular one. A shop for two markets is two deployments. |
| **Several users, roles or approval chains inside a customer** | An account is one buyer. Colleagues register their own accounts, and an order can be invoiced to another company or person. |
| **A separate quote process** | Every order is already a request that a manager answers, changes by agreement and confirms. |
| **Reviews, ratings and recommendations** | The main page has a featured row the admin chooses, topped up at random from what is in stock. |
| **Several warehouses** | A product has one stock count. Pickup points say where an order can be collected, not where stock is held. |
| **Free-form content pages or a blog** | A fixed set of pages (about, conditions, terms, privacy, imprint, withdrawal, contact) is edited in the admin, and each deployment chooses which to publish ([ADR 0027](adr/0027-fixed-page-set-with-per-deployment-publication.md)). |
| **Several shops or sellers in one installation** | One deployment is one shop. Several shops run as several stacks on one VM, as the two demo shops do. |
| **Writing the catalog back into the ERP** | The catalog flows inward only. Customers and orders flow both ways ([exchange-areas.md](exchange-areas.md)). |
| **Punchout, EDI and marketplace feeds** | The machine API connects the shop's own back office. Links to the shop's presences elsewhere sit in the footer. |
| **AI search or a chat assistant** | Ranked full-text search with typo tolerance, category suggestions and a fallback for a query typed on the wrong keyboard layout. |
| **A native mobile app** | Every storefront, account and admin view works on a phone. |

## Scale

The platform is sized for a catalog of a few thousand products, a few hundred customers and
one VM:

- A catalog run carries the **whole catalog** in one submission, up to 10 MB or 50,000 rows,
  and is compared against the catalog in memory. An order run answers up to 2,000 orders.
- Search runs on PostgreSQL's full-text and trigram indexes, without a separate search engine
  ([ADR 0030](adr/0030-product-search-postgres-fts-and-trigram.md)).
- One stack is one API process, one server-rendering process and one database on one VM with
  2–4 GB of memory ([infra/README.md](../infra/README.md#vm-requirements)). A release is a brief
  restart of that single instance ([NFR-OPS-06](requirements.md#nfr-ops-06)).

A catalog in the tens of thousands would need incremental catalog runs and probably a search
engine. Constant traffic would need more than one instance of each app. Neither is built,
because neither is needed.

## When it is the wrong choice

The platforms that fit these cases, with their prices, are in [comparison.md](comparison.md).

- A shop that needs to be online cheaply, with no ERP and no negotiated prices: a standard shop
  platform with a B2B plugin will do ([ADR 0001](adr/0001-build-custom-instead-of-shop-platform.md)).
- Consumer retail with card checkout, promotions and recommendations.
- A shop that sells in several languages or currencies from one storefront.
- Buyers that are large organisations with their own roles, budgets and purchase approvals.
- A catalog of many brands and configurable products, where variants are the catalog.
