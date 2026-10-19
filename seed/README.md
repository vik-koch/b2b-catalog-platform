# Seed bundle — Coffee Kontor demo

The demo content of the fictional Hamburg coffee roastery: catalog, accounts,
orders, documents and static pages. It is what the e2e suites seed and assert
against, what `nx run seeder:seed` writes into a local database, and what a demo
stack is seeded with unless its deploy names another bundle (`SEED_DIR`, see
[infra/README.md](../infra/README.md)). It belongs with the committed
[config/](../config/): the orders it holds snapshot that config's pickup points,
delivery zones and tax basis.

A bundle is data only. The seeder ([apps/seeder](../apps/seeder/)) reads it
whole and checks it against the schema in
[libs/seed/src/lib/bundle.ts](../libs/seed/src/lib/bundle.ts) before writing
anything; an unknown or misspelled key stops the seed.

## The files

```
catalog.json      categories, filterable attributes, products, pairings
accounts.json     the demo password, price tiers, accounts and their addresses
orders.json       placed orders, and the config values they snapshot
documents.json    certificates and data sheets, and what they are shown on
pages.json        each static page's title (and a consent page's box wording)
pages/<slug>.html each static page's body, as the rich-text editor stores it
```

Money is in minor units (`1690` = 16.90). Products, categories and orders are
named across files by their `sourceId`, slug or reference. Categories come
parents first, and their order in the file is their sort order. Order dates are
absolute: a reference carries the day it was placed, so a relative date would
mint a new order on every re-seed.

Upserted on every run: pages (as a new version when the text differs), the
catalog, tiers and prices, documents. Created only when missing: accounts,
addresses, orders and consents — they are people and events, so a visitor's
changes on a demo survive the next deploy.

Addresses use reserved `.example` domains and never the `@example.com` the e2e
suites claim, and no tier key starts with `e2e-`, so a seeded stack and a test
run never reach for the same row. The password in `accounts.json` is public on
purpose: it lets a visitor look around as a customer, and the seed only ever
runs on a demo.

## What each case is there to show

The bundle is a fixture as much as content: most products and accounts exist to
put one state on screen. Keep each case below when editing the bundle, or move
it to another record.

### Catalog

| Case                                                                                              | Where                                                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A category that paginates (page size 24)                                                          | 26 espresso roasts, `ESP-001`…`026`                                                     |
| Several pictures: tile slider, detail gallery                                                     | three on `ESP-001`…`004`, `ESP-006`, `FIL-001`, `SO-001`, `GRD-001`; two on most others |
| No picture at all                                                                                 | every 5th product in file order (`imageCount: 0`)                                       |
| A category without a mark, the name-only chip                                                     | `decaf` (`hasMark: false`)                                                              |
| Packs and boxes, the usual case                                                                   | espresso: six bags to a pack, four packs to a box                                       |
| A minimum above the pack size                                                                     | every 5th espresso (`minPieceQty: 24`)                                                  |
| Shipped as two boxes                                                                              | every 6th espresso (`boxCount: 2`)                                                      |
| Packs but no box                                                                                  | every 7th espresso                                                                      |
| Sold by the single bag, pack opened                                                               | `ESP-003`, `ESP-011`, `ESP-019` (`minPieceQty: 1`)                                      |
| Stock not tracked, no badge                                                                       | every 11th product in file order (no `stockPieces`)                                     |
| Out of stock                                                                                      | every 9th product in file order (`stockPieces: 0`)                                      |
| Few left, under every threshold                                                                   | every 7th product in file order (`stockPieces: 4`)                                      |
| Reduced tax rate beside the default one                                                           | coffee and tea at 7 %, the rest at the config's 19 %                                    |
| An attribute nobody declared, plain text                                                          | "Tasting notes"                                                                         |
| A number attribute stored unit-free; one value that does not parse                                | "Net weight", and `TEA-003`'s "ca. 250"                                                 |
| An assorted article: line note, variants on pictures, a long variant name, an unavailable variant | `CUP-001`                                                                               |
| Sold together (pairing): one cup, two lids                                                        | `CUP-003` with `CUP-004` and `CUP-005`                                                  |
| Sold as a set of parts, with an attribute per part; three boxes per hundred sets; few left        | `CUP-006`                                                                               |
| The featured row: two featured among the random fill                                              | `CUP-003`, `CUP-006`                                                                    |
| Unpublished, and deleted                                                                          | `FIL-090`, `FIL-091`                                                                    |
| The catalogue index's filter panel                                                                | `catalogFilters`: origin                                                                |

### Accounts

| Case                                                                                  | Where                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Staff: two managers, the approver of every approved customer                          | `office1@`, `office2@coffee-kontor.example`            |
| Companies on the wholesale tier, the bulk of the book                                 | the first ten customers                                |
| Tier ≠ customer type: companies at the base price, a person on wholesale              | `atelier-stpauli`, `buero-harvestehude`; `r.steinberg` |
| A tier that prices only some categories, the rest falling back to the base list       | `wholesale`'s `discounts`                              |
| Awaiting a decision: no tier, no approver, no password                                | the four `pending` accounts                            |
| Approved and invited, no password chosen yet                                          | the three `invited` accounts                           |
| Switched off, name kept                                                               | the two `disabled` accounts                            |
| Deleted by its owner: the tombstone the app leaves, address derived from its fixed id | the `anonymized` account                               |
| An address book with a choice, and an unlabelled entry                                | `cafe-nordlicht` (two), `hafenkantine` (one, no label) |
| A contact-form consent with no account behind it                                      | `inquiry`                                              |

Phones are stored as the app stores them: country code and bare national
digits, ten of them, as the demo's phone mask asks for.

### Orders

| Case                                                                       | Where            |
| -------------------------------------------------------------------------- | ---------------- |
| Ready, by bank transfer, the money not in yet                              | `CK-260811-4207` |
| A company collecting, with a preferred date and a line naming its variants | `CK-260817-1183` |
| Completed and paid, card arranged with the shop                            | `CK-260820-6640` |
| A guest's order, cancelled with a reason, for a second delivery zone       | `CK-260823-9014` |
| Accepted with changes: a second version and its note                       | `CK-260901-5528` |
| Invoiced to a company that is not the buyer's, priced provisionally        | `CK-260826-3352` |

Totals, line prices and shipment estimates are not written here: the seed
derives them from the catalog as seeded and the buyer's tier, as checkout would
have.

### Documents

| Case                                                               | Where                     |
| ------------------------------------------------------------------ | ------------------------- |
| Current, shown on a whole category                                 | Certificate of analysis   |
| A file and the register entry to check it against, about to expire | Organic certification     |
| Lapsed: work for the admin, shown to no customer                   | Import declaration        |
| No expiry date                                                     | Product data sheet        |
| A link only, no file                                               | Declaration of conformity |

Expiry is counted from the day of the seed run, so a long-running demo still
shows a current certificate.

### Pages

Demonstration text for every page of the fixed set. The privacy policy describes
what the software actually does, including its sections on the business
system — which belong only to a deployment that has one. Both consent pages are
published to show the mechanism; a deployment that relies on another legal basis
publishes neither.
