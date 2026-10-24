# Comparison with shop platforms

How the platform compares with the shop systems a small B2B wholesaler would otherwise
consider. Prices were checked on **24 October 2026**. They are list prices before VAT, or
third-party estimates where the vendor publishes none, and they leave out implementation, which
is the largest cost of a B2B shop on any of them. Check the vendor's own page before relying on
a figure.

## At a glance

<!-- prettier-ignore -->
| Platform | Model | Price | B2B features at that price |
| --- | --- | --- | --- |
| **This platform** | Open source (MIT), self-hosted | No licence. One small VM: the two demo shops share a 4 GB VM at about €4.50 a month, plus SMTP and a backup bucket | Staff-approved registration, hidden price groups, piece/pack/box, order requests a manager answers, catalog/customer/order exchange with an ERP |
| **WooCommerce + B2BKing** | Open source (WordPress) plus a paid plugin, self-hosted | WooCommerce free; B2BKing $199–$449 for the first year (1, 3 or unlimited sites), renewals at full price ($299.50–$599.50) | Registration approval, group pricing, hidden prices, quote requests, via the plugin |
| **Shopify** (Basic, Grow, Advanced) | SaaS | €27, €79 or €289 a month billed yearly (€36, €105, €384 monthly), plus card rates from 1.1% + €0.25 | Since 2 April 2026: company profiles, up to three B2B catalogs assigned through Markets, volume pricing, quantity rules, payment terms |
| **Shopify Plus** | SaaS | From €2,100 a month, plus a variable fee above a GMV threshold that Shopify does not publish | Unlimited catalogs, catalogs assigned directly to a company or location, deposits and partial payments |
| **Shopware** | Open source core; paid plans as SaaS or self-hosted | Community Edition free; Rise from €600 a month; Evolve from €2,400 a month; Beyond quoted. Plans priced by GMV | B2B Components (quotes, purchase approvals, organisation units, roles) from Evolve; not in Community Edition or Rise |
| **OroCommerce** | Open source Community Edition; Enterprise licensed | Community Edition free; Enterprise quoted by GMV tier. Third-party estimates: about $15,000–$50,000 a year for a mid-sized deployment | Built for B2B: customer organisations, price lists, quotes, workflows |
| **Adobe Commerce** | Licensed; on-premise, cloud or SaaS | Quoted by GMV. Third-party estimates: about $22,000 a year on-premise and $40,000 on Adobe's cloud below $1M GMV | B2B module with the licence: company accounts, shared catalogs, negotiable quotes, approvals, requisition lists |
| **Medusa** | Open source framework (MIT), self-hosted or Medusa Cloud | Framework free; Medusa Cloud reported from $29 a month | A headless commerce engine; B2B flows are built on top of it |

## What this client's requirements cost elsewhere

The client's needs (see the [README](../README.md#why-this-project-exists)) map onto the
platforms like this:

<!-- prettier-ignore -->
| Requirement | Off the shelf | Custom work on every platform |
| --- | --- | --- |
| Staff approve each registration and assign a hidden price group | WooCommerce + B2BKing, Shopware Evolve, OroCommerce, Adobe Commerce; Shopify through company profiles and catalogs | — |
| Prices per piece, pack or box, with minimum quantities | Quantity rules and volume pricing on most; selling one product in three units with exact per-unit prices is an extension or custom work | partly |
| An order is a request that a manager answers and changes by agreement, keeping every version | Quote workflows on Shopware Evolve, OroCommerce, Adobe Commerce; an order thread with versions the customer can read back is not standard | yes |
| The ERP owns the catalog, customers and orders area by area, and the shop keeps its own content | Every platform has an import and an API; the per-area ownership switch, staged runs and the read-only admin fields are integration work | yes |
| Runs on infrastructure the client owns, without a monthly licence | The open-source editions (WooCommerce, Shopware and OroCommerce Community Editions, Medusa) can, with the upkeep that self-hosting brings; the SaaS plans cannot | — |

So for this client, a standard platform covers the storefront and part of the B2B core. The
order process and the ERP exchange are custom work on any of them, which is where most of the
effort in this repository went. Without the portfolio purpose, WooCommerce with a B2B plugin, or
Shopify now that its B2B features reach the cheaper plans, would be the sensible way to start
([ADR 0001](adr/0001-build-custom-instead-of-shop-platform.md)).

## When another platform is the better choice

- **A shop that needs card checkout and marketing features today:** Shopify.
- **A shop already on WordPress with simple wholesale pricing:** WooCommerce with a B2B plugin.
- **Several sales channels, languages or brands from one system:** Shopware or Adobe Commerce.
- **B2B buyers that are organisations with roles, budgets and approval chains:** OroCommerce,
  Shopware Evolve or Adobe Commerce.
- **A team that wants a commerce engine to build its own storefront on:** Medusa.

What the platform deliberately leaves out is in
[scope-and-limitations.md](scope-and-limitations.md).

## Sources

- Shopware: [pricing](https://www.shopware.com/en/pricing/)
- Shopify: [pricing (EUR)](https://www.shopify.com/pricing),
  [changelog, 2 April 2026: B2B on non-Plus plans](https://changelog.shopify.com/posts/key-b2b-features-now-available-on-non-plus-plans)
- B2BKing: [pricing](https://kingsplugins.com/woocommerce-wholesale/b2bking/pricing/)
- OroCommerce: [TrustRadius](https://www.trustradius.com/products/orocommerce/pricing),
  [Abbacus estimate](https://www.abbacustechnologies.com/how-much-does-orocommerce-cost/)
  (Oro publishes no prices)
- Adobe Commerce: [Elogic cost benchmark](https://elogic.co/blog/adobe-commerce-b2b-cost/),
  [IWD on the B2B module](https://www.iwdagency.com/blogs/news/adobe-commerce-b2b/)
  (Adobe publishes no prices)
- Medusa: [Medusa Cloud pricing](https://docs.medusajs.com/cloud/pricing),
  [third-party summary](https://www.buildwithmatija.com/blog/medusajs-pricing-cloud-self-host-costs-2026)
- Hetzner CX23 (2 vCPU, 4 GB): [VPSBenchmarks](https://www.vpsbenchmarks.com/hosters/hetzner/plans/cx23)
