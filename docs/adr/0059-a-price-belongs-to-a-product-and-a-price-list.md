# 0059 — A price belongs to a (product, price list) pair

**Status:** accepted · **Date:** 2026-09-11

Supersedes the storage half of
[ADR 0031](0031-customer-tiers-and-price-lists.md):
the default list is no longer a column, and no key is reserved. Tiers stay
rows, stay unordered, and resolution keeps its fallback.

## Context

ADR 0031 kept the default list in `products.defaultPriceMinor` and put the
other lists in `product_prices`. That was correct while there was one list: a
baked column always exists, exactly once, and guests — nearly all catalog
traffic — read it with no join.

Two things have since made it wrong rather than merely asymmetric.

**A product exists before its price does.** The source system exports its
catalog and its prices as separate files
([ADR 0054](0054-source-system-exchange-as-an-inbound-adapter.md)). A
`NOT NULL` base price forces the adapter to either buffer both files before
writing anything, or invent a zero — a workaround for a schema asserting
something untrue, or a lie that can reach an order line.

**The fallback may now be wrong, and nothing says so.** A tier with no row is
charged the default list's price. If the exchange prices `wholesale` for 300 of
400 products, the remaining hundred quietly charge wholesale customers the guest
price. That is a commercial question the platform cannot answer, but it could
not previously even be **asked**: "which products does this list not price?" had
no expressible form for the one list that mattered.

Two details of the schema had already been saying the same thing. `customer_tiers`
carried a check constraint **forbidding** the key `default` — a table refusing a
value because that value lives somewhere else is a schema reporting a missing
row. And the invariant "guests see the lowest-tier price" was never implemented
as lowest: tiers do not rank, so it was implemented as "the base column". The
pointer to one designated list already existed, encoded in a column name.

## Decision

- **Every price is a `product_prices` row**, the default list's included.
  `products.defaultPriceMinor` is removed.
- **One tier row carries `isDefault`** — the list guests, crawlers, staff and
  untiered customers are charged. At most one, by a partial unique index
  (`WHERE "isDefault"`); at least one, by refusing to delete it
  (`tier-is-default`), which no index can state.
- **No key is reserved.** The `key <> 'default'` check is dropped and the
  migration creates a tier actually keyed `default`, so a file's `price:default`
  column goes on addressing the same list. A bare `price` column means
  **whichever list carries the badge**, whatever it is keyed.
- **A product may have no price**, and then cannot be published: `setProductPublished`
  refuses with `product-has-no-price` (FR-ADM-06), and saving a published product
  with its price cleared takes it off the storefront in the same write.
- **A price is positive, and "not priced" is the absence of the row.** There is
  no second spelling: `product_prices` carries a `> 0` check, the write
  contracts refuse a zero, a catalog file carrying one is a row error rather
  than a product given away, and an admin field left at zero empties itself.
- **The badge is the shop's, not the exchange's.** It stays editable while the
  catalog is externally owned
  ([ADR 0056](0056-an-external-owner-makes-fields-read-only.md)), like a tier's
  label and order: the exchange writes prices, never which list the public sees.
- **`users.tierId` stays nullable and stays the only spelling of "the default
  list".** Accounts are not pointed at the badged row.

## Rationale

**A price is an attribute of a (product, price list) pair.** Baking one list in
is right exactly while there is one list; with N it is secretly the (N+1)th, and
every pricing rule gets two implementations — a write path that has to know which
kind of price it is addressing, a differ with a special case per direction, an
admin editor with a field and a table saying the same thing in two shapes.
Removing the column deletes those pairs rather than maintaining them.

**The badge makes an existing decision visible; it does not add a concept.**
Which list the storefront quotes was already decided — by a column name. Naming
it lets an admin change it, lets the sync address it without a reserved word,
and makes the brief's own invariant true as written.

**Exactly-one belongs to the database, at-least-one to a refusal.** A partial
unique index cannot be raced; a "delete the last one" rule has no index form, so
it is a service refusal with its own code, said in the row that offers the
button rather than discovered by pressing it.

**Moving the badge unpublishes rather than refusing.** Products the newly badged
list does not price would otherwise stay on the storefront quoting a price that
no longer exists. Refusing the move instead would make the badge unmovable for as
long as one product is unpriced. The screen states the figure before the move, so
the outcome is the one the admin chose.

**Zero is not a price.** With the base price a `NOT NULL` column, a zero was
the only way an importer could say "no price yet" — the workaround this ADR
removes. Keeping it _legal_ afterwards would leave the state with two
spellings, and every screen reads the second one as a product given away: a
storefront tile quoting 0,00, a cart totalling nothing, an order line charging
nothing. So it is refused where the state lives, in the check constraint, and
at each edge that writes one.

**The unpriced are their own work queue.** A product no list prices cannot be
published, so counting it among "awaiting publication" would leave a figure
nobody can clear by doing the work the figure names — against FR-WORK-02. The
two counts are disjoint: one is "look at this and publish it", the other is
"this needs a price, here or in the export".

**Rejected: a price cache.** An invalidated price cache is a bug generator, and
at several hundred SKUs the resolution is an index lookup. The guest path now
runs a correlated subquery where it read a column; if a listing ever feels slow
the answer is a covering index on `product_prices (tierId, productId, priceMinor)`.

**Rejected: pointing untiered accounts at the badged row.** Guests have no
account at all, so null must resolve to the default list regardless. Backfilling
accounts would give one state two representations and make moving the badge a
write across `users`.

## Consequences

- (+) One write path, one read path, one shape for every price. The differ's
  `default` special case, the reserved key, and the editor's split between "the
  price" and "tier prices" all go.
- (+) The exchange can import products and prices in either order, and the
  products it has not priced are a number on the admin panel instead of a
  silence.
- (+) "Which products does this list not price?" is now askable of every list,
  the storefront's included — one filter, reached from the count beside it.
- (+) A deployment renames the storefront's list like any other; nothing
  reserves a word, and its name is data rather than deployment text.
- (−) The guest price resolves through a subquery rather than a column, and the
  price sort with it. Accepted: sorting is off in the deployment this serves,
  and the covering index is the answer if that changes.
- (−) A deployment that had written a zero as "not priced" loses those rows in
  the migration, and those products come off the storefront — which is what the
  zero already meant everywhere it was read.
- (−) A price is nullable throughout the admin surfaces — the grid, the editor,
  the hidden-products panel, an order adjustment. The storefront's contract
  stays non-null, because publication guarantees it.
- (⚠) The migration names the new tier in English (`Base price list`); a
  migration has no deployment text to read. A non-English deployment renames it
  once, in the admin UI.
- (⚠) A tier key may now be any script, so two encodings of one letter would
  address two lists. Keys are NFC-normalized on the way in and matched
  case-insensitively **in the service**, not by a `lower(key)` index: Postgres
  folds case by collation and JavaScript by the Unicode default, and one rule
  applied once cannot disagree with itself.
