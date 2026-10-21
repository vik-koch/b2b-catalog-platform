# Seed bundle — Slaney Labware demo

The demo content of a fictional laboratory-consumables supplier in
Enniscorthy, Ireland, selling to businesses and institutions only: catalog,
accounts, orders, documents and static pages. The format, the seeding rules and
the picture handling are those of the fixture bundle — see
[seed/README.md](../../../seed/README.md). This bundle belongs with
[../config/](../config/): its orders snapshot that config's pickup points,
delivery zones and tax basis (VAT added to net prices, 23 %).

Photos are Pexels studio shots where the library has them, and lab scenes where
it does not (the pipettes). Glassware and clear plastics are photographed on
the pastel backgrounds one photographer's series shares, so most tiles sit on
the same light blue.

## What each case is there to show

Keep each case below when editing the bundle, or move it to another record.

### Catalog

| Case                                                                                              | Where                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A listing that pages (page size 24)                                                               | the whole catalogue: 36 products on the storefront                        |
| Several pictures: tile slider, detail gallery                                                     | three on `PIP-008`, `CON-015`, `PET-090`, `FLA-250`, `CYL-100`, `RCK-015` |
| No picture at all                                                                                 | `CRY-081`, `BEN-001` (`pictures: []`)                                     |
| A category without a mark, the name-only chip                                                     | `bench-supplies` (`mark: null`)                                           |
| Subcategories under a top-level category, counted as a subtree                                    | `tubes` (three), `glassware` (three)                                      |
| Racks and boxes, ten packs to a box: a box read in tenths                                         | pipette tips: 96 to a rack, ten racks to a box                            |
| A minimum above the pack size                                                                     | `CON-015` (`minPieceQty: 100`, racks of 50), `PET-090`                    |
| Shipped as two boxes                                                                              | `CON-050` (`boxCount: 2`)                                                 |
| Every product in packs and boxes with a volume and weight: any cart gets a shipment estimate      | the whole catalogue                                                       |
| Sold singly, pack opened                                                                          | `FLA-250` (`minPieceQty: 1`, packs of ten)                                |
| A piece that is itself a box                                                                      | the gloves: a box of 100 is the piece, ten to a carton                    |
| A pack of one: an instrument boxed singly, cartons of a few                                       | `PIP-001`, `PIP-008`, `PIP-010`, `FLA-500`, `BEN-004`                     |
| Stock not tracked, no badge                                                                       | `PIP-001`, `BEN-004` (no `stockPieces`)                                   |
| Out of stock                                                                                      | `PET-055` (`stockPieces: 0`)                                              |
| Few left: at or under one box, one pack, or the configured count                                  | `TIP-1000`, `CRY-002`, `FLA-500`, `GLV-L`, `PIP-008`                      |
| A zero tax rate beside the default one                                                            | `BEN-003`, a printed book (`taxRate: 0`); the rest at the config's 23 %   |
| An attribute nobody declared, plain text                                                          | "Compatible with"                                                         |
| A number attribute stored unit-free; one value that does not parse                                | "Volume", and `VIA-002`'s "approx. 1.8"                                   |
| An assorted article: line note, variants on pictures, a long variant name, an unavailable variant | `CON-016`                                                                 |
| Sold together (pairing): one vial, two caps; a pipette and its tips                               | `VIA-002` with `VIA-C09` and `VIA-C10`; `PIP-001` with `TIP-200`          |
| Sold as a set of parts, with an attribute per part; few left                                      | `CRY-002` (vial + cap)                                                    |
| The featured row: two featured among the random fill                                              | `TIP-200`, `CON-015`                                                      |
| Sizes as separate articles, not variants                                                          | `GLV-M`, `GLV-L`                                                          |
| Unpublished, and deleted                                                                          | `TIP-090`, `RCK-091`                                                      |
| The catalogue index's filter panel                                                                | `catalogFilters`: material, sterile                                       |

### Accounts

| Case                                                                                  | Where                                                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Staff: two managers, the approver of every approved customer                          | `orders@`, `sales@slaney-labware.example`                                                    |
| Three tiers beside the list price: academic, healthcare, contract                     | universities and colleges, labs in health care, industry                                     |
| A tier that prices only some categories, the rest falling back to the list price      | `healthcare`'s and `contract`'s `discounts`                                                  |
| Tier ≠ customer type: companies at the list price                                     | `corrigan-brewing`, `moyne-water`                                                            |
| A sole trader: a business with a VAT number and no company number, on a tier          | `aoife@kinsella-microbiology`                                                                |
| Registration numbers in both configured formats                                       | VAT numbers on most; company numbers on `ardcairn-pharma`, `moyne-water`, `bunclody-schools` |
| Awaiting a decision: no tier, no approver, no password                                | the three `pending` accounts                                                                 |
| Approved and invited, no password chosen yet                                          | the two `invited` accounts                                                                   |
| Switched off, name kept                                                               | `oulart-agri` (`disabled`)                                                                   |
| Deleted by its owner: the tombstone the app leaves, address derived from its fixed id | the `anonymized` account                                                                     |
| An address book with a choice, and an unlabelled entry                                | `brennan-biologics` (two), `ardcairn-pharma` (one, no label)                                 |
| A contact-form enquiry with no account behind it                                      | `inquiry`                                                                                    |

There are no private persons: the shop sells to businesses only. Phones are
stored as the app stores them, country code and bare national digits; Irish
numbers vary in length, so the config sets no phone mask.

### Orders

| Case                                                                         | Where            |
| ---------------------------------------------------------------------------- | ---------------- |
| Ready, by bank transfer, the money not in yet, outside the van's zone        | `SL-260811-4207` |
| A company collecting, with a preferred date and a line naming its variants   | `SL-260817-1183` |
| Completed and paid, card arranged with the shop, delivered in the south-east | `SL-260820-6640` |
| A guest's order, cancelled with a reason                                     | `SL-260823-9014` |
| Accepted with changes: a second version and its note                         | `SL-260901-5528` |
| Invoiced to a company that is not the buyer's, priced provisionally          | `SL-260826-3352` |

Every party is a business, guests included.

### Documents

| Case                                                               | Where                               |
| ------------------------------------------------------------------ | ----------------------------------- |
| Current, shown on a whole category                                 | Certificate of analysis             |
| A file and the register entry to check it against, about to expire | ISO 9001 certificate (manufacturer) |
| Lapsed: work for the admin, shown to no customer                   | RNase/DNase-free certificate        |
| No expiry date                                                     | Technical data sheet                |
| A link only, no file                                               | EU declaration of conformity        |

### Pages

The published set is about, contact, conditions, terms, privacy and the company
information. The right of withdrawal and both consent pages are seeded — the
slug set is fixed — but not published: a business buyer has no statutory right
of withdrawal, and the shop relies on contract and legitimate interest rather
than consent. Their bodies say so, for an admin who opens them.
