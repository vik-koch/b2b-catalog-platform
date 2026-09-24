# 0063 — Show a category as a chip, and retire its picture

**Status:** accepted · **Date:** 2026-09-21

Narrows [FR-CAT-07](../requirements.md#fr-cat-07), which gave a category a mark
_in addition to_ the picture its card carried.

## Context

A category was drawn two ways. The main page showed an editorial card — a 16:9
photograph, the name under it, subcategories as pills below — and `/catalog`
showed a dense grid of square picture tiles with a few subcategory links. Only
the subcategory navigation of a listing drew the chip that iteration 15 added
(FR-CAT-07): the mark beside the name, in a small filled box.

So a visitor met the same category as three different objects, and a category
had to carry two images to be drawn at all.

The picture was also the weaker half. A category is a grouping of products, so
its picture is either a photograph of one arbitrary member — which reads as a
product and invites a click that lands somewhere else — or stock art. Nothing
supplies it but an admin: the catalog sync (FR-ADM-07) never writes it, so the
one image a category is drawn from is the one image nobody maintains. And on a
main page that is about to carry a featured row of products
([FR-CAT-09](../requirements.md#fr-cat-09)), category photographs compete with
the products for the emphasis that belongs to the products.

## Decision

The storefront draws a category as a **chip** — mark beside name — wherever it
appears: the main page, the catalogue index, the subcategory navigation of a
listing, and the category group in the search suggestions
([FR-SEARCH-07](../requirements.md#fr-search-07)). The chip has two sizes and
nothing else varies between them. The category picture is **removed**: the
column is dropped, the admin field and the contract fields go with it, and
nothing converts a picture into a mark.

## Rationale

**One object, recognised everywhere.** A chip that is the same shape in four
places is learned once. Three drawings of a category taught nothing that
transferred, and the pills under a card were a fourth thing again.

**A mark is the honest illustration of a grouping.** It identifies without
claiming to depict: a photograph of one product says "this is a product", which
is the one thing a category is not.

**The index gets denser without getting poorer.** A row of chips carries the
names of the second level beside the first, where the picture tiles spent their
height on photographs and truncated the subcategories to three links. A buyer
who knows what they came for reads more of the catalogue per screen.

**Removed, not kept dormant.** A field the admin editor still offers and the
storefront never reads invites an admin to fill it and wonder why nothing
changes. Keeping the column "in case" is keeping it for a category hero nobody
has asked for, and a banner over a listing would want its own shape and its own
field anyway.

**Not migrated into marks.** A photograph cropped to a 24px square is a smear
of one product, which is the very thing the chip is meant not to say. A mark is
drawn for the purpose or it is absent, and absent already has a fallback.

**Rejected: keeping the card on the main page and chips elsewhere.** It is the
status quo's split with better art, and it has to be re-decided the moment the
featured row lands. Rejected: **dropping the mark too**, leaving a text-only
chip — the mark is what makes the chip readable at a glance, and the one image a
category can carry that stays true as the products beneath it change.

## Consequences

- (+) One component draws every category the storefront shows; the main page and
  the index differ by their heading, not by their design.
- (+) A category needs one image, and it is the one that survives a sync.
- (+) The main page is ready for FR-CAT-09: the featured products are the only
  photographs on it.
- (−) A category with no mark is now a name in a box, where it used to have a
  picture. The fallback was always the name; it is simply seen more often, and
  the remedy is to file a mark.
- (−) A migration drops `categories.image`. The media-prune sweep stops counting
  those files as referenced, so the next scheduled run deletes them from the
  media store.
- (⚠) Deployments that curated category photographs lose them on upgrade. The
  migration runs unattended and no port contract changes — the catalog sync
  never carried the picture — so it stays a minor release under
  [ADR 0044](0044-versioning-by-what-a-release-changes.md); the release notes
  say to back up the media store first if the photographs are wanted.
