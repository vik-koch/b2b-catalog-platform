# 0037 — Store product attributes as rows, and declare the filterable ones

**Status:** accepted (amended 2026-08-19, 2026-08-28) · **Date:** 2026-08-18

## Context

A product's characteristics live in `products.attributes`, a jsonb list of
`{key, value}` strings (FR-CAT-05). It is an admin overlay under ADR 0022 — the
bulk sync never writes it — and it is edited in a spreadsheet-like
`contenteditable` grid whose whole value is that TSV copy/paste works: staff
fill the first product in a category by hand and paste the block across the
rest.

The client now wants what every catalog eventually wants: filter a category or a
search result by those characteristics (FR-ATTR-\*), and find where an attribute
is used across the catalog. Nothing about the current storage answers that. No
value is typed, no key is countable without unpacking a document, and a facet
panel needs counts and intersections rather than a single match.

Two facts constrain the answer. The attribute table is how several hundred
products are being entered **right now**, so a design that changes data entry
costs the client the catalog they have already typed. And attribute text is
written by hand, so "Blue" and "blue" are two strings and always will be.

Alternatives considered: keeping the jsonb as the source of truth and
maintaining a derived index table beside it; a GIN index on the jsonb with
containment queries; a typed column per filterable attribute; binding
attributes to categories by schema; and normalizing values (casefold, unaccent)
so near-duplicates group automatically.

## Decision

Attributes move out of the jsonb column into a `product_attributes` table —
one row per attribute, carrying `sortOrder`, `key`, `value` and a `valueNumeric`
parsed from the value wherever it reads as a number. A separate
`attribute_definitions` registry names which keys are filterable, with a type, a
display unit and a facet order. Both API contracts keep the array shape they
have today, and the editing grid is untouched.

## Rationale

**`valueNumeric` is parsed unconditionally**, for every row whose text reads as
a number, whatever any definition says. That keeps the definitions free of data:
a definition decides which key is _filterable_ and how it is ordered and
labelled, never what gets stored. Retyping or renaming one is then a metadata
edit with nothing to rebuild — where a definition-driven projection would have
to re-derive every affected row inside the same transaction.

**Parsing is not permission.** A value that will not read as a number is stored
and displayed unchanged and simply has no numeric form, so it drops out of that
facet and the admin is told how many did. Refusing the save would stop a bulk
paste of a hundred rows because one cell says "ca. 30" — the client's data is
the reason the feature exists, and a validator that rejects it is the wrong end
of the trade.

**No implicit normalization beyond trimming.** Casefolding and unaccenting would
group "Blue" with "blue" automatically, and was rejected: attribute text is the
client's own vocabulary, and silently merging values that are genuinely
different reads as data loss the moment it is wrong. Consistency is the admin's
responsibility, made practical by an inventory view listing every key and value
with counts — a typo sits next to its correct spelling and is renamed across the
catalog in one statement, which is what rows make cheap. Whitespace is the
single exception, because a trailing space is invisible in every list an admin
could inspect, and a difference nobody can see cannot be anybody's
responsibility.

**Keys stay text on the row**, not foreign keys into a table of keys. Renaming
is already a single `UPDATE ... WHERE key = $old`; a keys table would add
upsert-on-save and orphan cleanup for no gain, and would make key identity
structural in a model that deliberately treats an exact match as the rule.

**A registry, not a schema.** A definition does not constrain what a product may
carry; it says which existing attribute is worth filtering by. That is what lets
one be added at any time and take effect on products entered months earlier, and
why the grid needs no change: it keeps emitting plain strings. A typed column
per attribute would be the opposite trade — a release per attribute, and a
schema the client cannot extend.

**Facets come from the data in scope, not from a binding.** Which attributes a
category offers is derived from the products in it, so there is no
category-to-attribute mapping to maintain and no way for the two to disagree.
Counts for one attribute are computed with every _other_ selection applied but
not its own — the disjunctive rule — because the alternative collapses every
list to the value already chosen and makes the panel a dead end.

**The contracts do not change.** `attributes` stays an ordered array of
`{key, value}` on both the public and the admin shapes; only storage moves. That
is exactly the decoupling ADR 0022 was written for, and the first time it is
cashed in. The write path has a precedent too: `product_prices` already replaces
a product's child rows wholesale from what the editor sends.

## Consequences

- (+) One representation of an attribute, so a facet cannot disagree with the
  product page.
- (+) Counting, grouping, filtering and renaming across the catalog are ordinary
  indexed SQL, and work for freetext keys as well as declared ones.
- (+) Definitions hold no data: adding, retyping or renaming one rebuilds
  nothing.
- (+) The attribute grid, its paste behaviour and its undo stack are untouched,
  and no API consumer sees the change.
- (+) Attributes stay outside the sync, so no import run can break a filter.
- (−) A one-way data migration over attributes the client has already entered.
  It is the cheapest it will ever be, and gets more expensive with every product
  typed.
- (−) A product write becomes a transaction over child rows rather than one
  column update, and the product page gains a join.
- (−) Exact matching means "Colour" and "color" are two attributes and "Blue"
  and "blue" two values, visibly, until somebody renames one.
- (−) A number-typed attribute silently filters on fewer products than it
  describes wherever a value did not parse.
- (⚠) Filtered listing URLs are a combinatorial space and must carry the
  canonical of the unfiltered listing (NFR-SEO-04, ADR 0024).
- (⚠) Facet counts read the catalog and must apply the same publication and
  soft-delete predicate as the listing itself, or an unpublished product is
  countable while invisible.
- (⚠) Attribute order is data now (`sortOrder`), not array position. Every read
  must order by it explicitly, or the grid silently reshuffles between saves.

## Amendment — 2026-08-19: which products the admin-side numbers count

The registry and the inventory both report per-attribute usage, and the
inventory renames text across the catalog. Those two started out disagreeing:
the counts excluded soft-deleted products while a rename rewrote them, so the
drill-down could land on more products than the number that led to it.

**Every admin-side attribute number is now taken over the catalog as stored —
unpublished _and_ soft-deleted products included.** The three things an admin
does with these figures then describe one set: the count, the rename that
rewrites exactly those rows, and the drill-down into the admin product grid,
whose own default state filter already shows unpublished and deleted rows.

A rename has to reach soft-deleted products regardless: deletion is reversible
here, and a restored product must not come back carrying a spelling the rest of
the catalog has left behind. Counting a smaller set than the rename touches was
the part that could not be defended.

The storefront's facet counts keep the opposite rule, and the (⚠) above still
holds: they apply the publication gate and the soft delete, because they
describe what a visitor can actually reach. The two rules differ because the
questions differ — "what does the catalog hold" against "what can be seen" —
and each surface says which it is answering in its own wording.

## Amendment — 2026-08-28 (v1.5.0): a category chooses its own facets

The registry declares which attributes are filterable catalog-wide, and every
listing offered all of them that its products carried. That is right for a
category whose products share a vocabulary and wrong for one that does not: an
attribute can be present, countable, and still not worth a facet, and the order
that reads well in one category reads badly in another.

**A category may declare which filterable attributes its listing offers, and in
what order** (FR-ATTR-11), in a `category_attributes` overlay of
`(categoryId, attributeId, sortOrder, hidden)`. The registry's order is the
default and most categories keep it.

Three properties make the overlay cheap to hold in the head:

- It **replaces** the inherited list rather than adjusting it, and a category
  with no rows of its own takes its nearest ancestor's whole. An override on a
  parent needs no restating under its children.
- It is saved as a whole panel: an attribute the editor omits is stored
  `hidden` rather than deleted, so an empty panel stays empty instead of
  falling back to the ancestor's.
- An attribute declared after an overlay was saved is in none of its rows, so
  it is offered only where nothing is overlaid at all. Declaring an attribute
  is not a promise that every listing shows it.

A product's attribute row links to its category's filtered listing (FR-ATTR-08)
only where that category offers the attribute; elsewhere the row is plain text,
because the link would land on a panel with no such facet to select.

This is the "bind attributes to categories" alternative the Context weighed and
rejected, kept out of the place it was rejected from: the binding is
presentation, resolved at read time, and no product's storage or entry changes
with it. What is filterable is still one catalog-wide answer.
