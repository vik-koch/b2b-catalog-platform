# 0064 — Name a product's variants on its pictures, not as articles

**Status:** accepted · **Date:** 2026-09-29

## Context

Some goods come in colours or designs that the source system does not tell
apart: one article, one price, one stock figure, sold assorted or with the
customer's preference written in the cart line's note
([FR-CART-08](../requirements.md#fr-cart-08)). The pictures already show the
variants, but nothing says which picture is which, so the note asks for a word
the customer cannot find on the page.

This is not the case of several articles gathered onto one page — a shirt in
three sizes, each with its own price and stock. The goods here are **assorted**:
one article whose pieces differ in colour or design, so the shop may pick the
mix or honour a customer's stated preference. Nothing about the article
changes with the variant, not its price, stock or packaging.

A real variant model — one row per colour with its own stock, a selector that
splits the cart line — is what a shop with per-variant articles would build.
Here it would be a structure the source system never fills and the order
exchange cannot carry back, and it contradicts the note's rule that a product
in a given unit is one line.

## Decision

A product carries an ordered list of **variants**: a short name and a
_currently unavailable_ mark, nothing else. Each picture points to **at most
one** variant. How the variants are shown depends on the size of the picture:
the product page lists them next to its gallery, a card labels each picture
over its corner, and a picture too small for a label gets a mark that opens the
product page's list ([FR-CAT-11](../requirements.md#fr-cat-11),
[FR-CAT-12](../requirements.md#fr-cat-12),
[FR-CAT-13](../requirements.md#fr-cat-13)). Variants are display only and the
shop's own: no cart, order or exchange field reads them.

## Rationale

**Variants are listed apart from pictures.** Naming the pictures directly
would be simpler, but a variant can have two pictures (front and back), or none
yet, and must be orderable and markable without touching the gallery's own
order.

**At most one variant per picture.** A photograph of the whole range would
carry "Red, Blue, Green, …" as its label, which is long, wraps in any language
with long colour names, and tells the viewer nothing the list beside it does
not. Such a picture belongs to no variant and is shown unlabelled.

**Unavailable is a mark, not a deletion.** A colour that runs out comes back,
and deleting it would mean uploading and linking its pictures again. Its
pictures are withheld, but its name stays on the list, marked, because "we
have it, just not now" is worth saying. A variant that will never return is
deleted, and its pictures fall back to unlabelled rather than being removed
with it, so deleting a name never deletes an upload. The mark is not stock:
product availability stays one figure, owned by whoever owns the catalog.

**The picture's size picks the form, not the screen's.** A card on a phone is
nearly as wide as the screen and carries a label comfortably. A row in the lines
listing or a cart line has a thumbnail that nobody studies, whatever the screen,
because there the name is what is read. So the product page lists variants
beside the gallery (never over a picture it is there to show), a card labels
its pictures and needs no list, and a small picture gets a mark. That makes
three presentations of two parts, the list and the label, with the mark opening
the list in the bubble the line note already uses. A phone changes only the
bubble into a dialog, as it does for the note. The cart matters most here,
because the note is typed there. Search suggestions get none of this, because
they are scanned in passing and are not where a variant is chosen.

**Rejected: an attribute row per variant** ("Colour: red, blue"). It filters,
but it cannot point at a picture, and it would enter the attribute registry and
the exchange, both of which read attributes.

## Consequences

- (+) The note's prompt can say "state the colour" and the customer can see
  the colours, and their names, from the page and the cart.
- (+) Nothing crosses the exchange boundary: the sync import shape and the order
  write-back are unchanged, and ownership of the catalog does not freeze
  variants.
- (−) A variant carries no stock, so an unavailable colour is only as accurate
  as the admin who marks it.
- (−) Choosing a variant does not fill in the note. That would be cart logic,
  and it remains open.
- (−) A migration adds the variant list to products and an optional variant
  reference to each picture. It runs unattended, so the release is minor under
  [ADR 0044](0044-versioning-by-what-a-release-changes.md).
