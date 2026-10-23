# Seed bundle — Coffee Kontor demo

The demo content of the fictional Hamburg coffee roastery: catalog, accounts,
orders, documents and static pages. It is what the e2e suites seed and assert
against and what `nx run seeder:seed` resets a local database to by default;
the demo stacks seed the other bundles in [deployments/](../../README.md)
(`SEED_DIR`, see [infra/README.md](../../../infra/README.md)). It belongs with
the fixture's [config/](../config/): the orders it holds snapshot that config's
pickup points, delivery zones and tax basis.

A bundle is data only. The seeder ([apps/seeder](../../../apps/seeder/)) reads it
whole and checks it against the schema in
[libs/seed/src/lib/bundle.ts](../../../libs/seed/src/lib/bundle.ts) before writing
anything; an unknown or misspelled key stops the seed.

## The files

```
catalog.json      categories, filterable attributes, products, pairings
accounts.json     the demo password, price tiers, accounts and their addresses
orders.json       placed orders, and the config values they snapshot
documents.json    certificates and data sheets, and what they are shown on
pages.json        each static page's title (and a consent page's box wording)
pages/<slug>.html each static page's body, as the rich-text editor stores it
marks/<name>.svg  the icons the category marks are drawn with
settings.json     optional: the areas an external system owns, and its token
```

Money is in minor units (`1690` = 16.90). Products, categories and orders are
named across files by their `sourceId`, slug or reference. Categories come
parents first, and their order in the file is their sort order. Order dates are
absolute: a reference carries the day it was placed, so a relative date would
mint a new order on every re-seed.

A bundle is loaded into an empty database: a stack is reset before it is
seeded ([infra/README.md](../../../infra/README.md#seeding-a-demo-stack)), so
nothing a visitor did survives a reset, and nothing an older bundle had either.

`settings.json` is for a shop an external system feeds. It lists the areas that
system owns (`catalog`, `customers`, `orders`) and names its machine token and
what the token may do. The token's value is a secret, so it is never in the
bundle: the seed is handed it as `SEED_MACHINE_TOKEN` and stores its hash, as
the platform does for a token it issues. Without a value the areas are owned and
no token is seeded. This bundle has no `settings.json`: its staff own
everything.

## Category marks

A category's `mark` names an icon in `marks/`; the seed draws it on a tinted
disc, the way an uploaded mark is shown on a chip. The icons are
[Lucide](https://lucide.dev)'s, copied from the `lucide-static` package the web
app already uses — ISC-licensed, see `marks/LICENSE`. Any 24-unit stroked icon
in that style works; add the file, then name it.

## Pictures

A product's `pictures` (and a variant's) is its gallery, in order. An entry
with a `url` is a photo: the seed downloads it, keeps the square `crop` names
(fractions of the photo; the centred square without one), applies a `tint` if
it has one, and stores it at the catalog's two sizes as an admin upload would
be. An empty entry `{}` is a generated placeholder, and so is a photo whose
download fails — the seed warns and carries on, so a dead link costs a picture,
not the seed. `source` and `credit` record where a photo came from; nothing
shows them.

Photos are linked, never committed: the bundle points at a library's CDN
(Unsplash and Pexels need no attribution) and every seed run fetches them, so a
dead link is replaced by editing the bundle. Seeded with
`SEED_PICTURES=placeholder`, every entry is drawn instead — what the e2e suites
do, so a test run needs no network and a product shows the same number of
pictures either way. A variant's `colour` is what its placeholders are drawn
in.

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

| Case                                                                                              | Where                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A listing that pages (page size 24)                                                               | the whole catalogue: 33 products on the storefront                                                            |
| Several pictures: tile slider, detail gallery                                                     | three on `ESP-001`…`003`, `ESP-006`, `FIL-001`, `SO-001`, `GRD-001`, `MCH-001`, `CUP-002`; two on most others |
| No picture at all                                                                                 | `ESP-005`, `ACC-002` (`pictures: []`)                                                                         |
| A category without a mark, the name-only chip                                                     | `machines` (`mark: null`)                                                                                     |
| Packs and boxes, the usual case                                                                   | espresso: six bags to a pack, four packs to a box                                                             |
| A minimum above the pack size                                                                     | `ESP-005` (`minPieceQty: 24`)                                                                                 |
| Shipped as two boxes                                                                              | `ESP-006` (`boxCount: 2`)                                                                                     |
| Packs but no box                                                                                  | `ESP-007`, `ESP-014`                                                                                          |
| Sold by the single bag, pack opened                                                               | `ESP-003` (`minPieceQty: 1`)                                                                                  |
| Stock not tracked, no badge                                                                       | `SO-002`, `CUP-002` (no `stockPieces`)                                                                        |
| Out of stock                                                                                      | `ESP-009`, `FIL-001`, `TEA-002` (`stockPieces: 0`)                                                            |
| Few left, under every threshold                                                                   | `ESP-007`, `ESP-014`, `FIL-002`, `TEA-001`, `ACC-002` (`stockPieces: 4`)                                      |
| Reduced tax rate beside the default one                                                           | coffee, tea, syrup and chocolate at 7 %, the rest at the config's 19 %                                        |
| An attribute nobody declared, plain text                                                          | "Tasting notes"                                                                                               |
| A number attribute stored unit-free; one value that does not parse                                | "Net weight", and `TEA-003`'s "ca. 250"                                                                       |
| An assorted article: line note, variants on pictures, a long variant name, an unavailable variant | `CUP-001`                                                                                                     |
| Sold together (pairing): one cup, two lids                                                        | `CUP-003` with `CUP-004` and `CUP-005`                                                                        |
| Sold as a set of parts, with an attribute per part; three boxes per hundred sets; few left        | `CUP-006`                                                                                                     |
| The featured row: two featured among the random fill                                              | `CUP-003`, `CUP-006`                                                                                          |
| Unpublished, and deleted                                                                          | `FIL-090`, `FIL-091`                                                                                          |
| The catalogue index's filter panel                                                                | `catalogFilters`: origin                                                                                      |

The photos are studio shots on white or light grey where the library has one,
and café scenes where it does not (the shop grinder, the tamper, the brush).
Several products share a photo under different crops — a whole shot and a
detail — which is also how a product shows several pictures of itself.

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
