-- The base price stops being a column and becomes a price list like any other.
-- A price is an attribute of a (product, price list) pair: with the base list
-- baked into `products`, it was secretly the (N+1)th list and every pricing
-- rule had two implementations. One row now carries the badge instead.

-- The reserved key goes first: the next statement creates a tier that holds it.
ALTER TABLE "customer_tiers" DROP CONSTRAINT "customer_tiers_key_not_default";--> statement-breakpoint

-- The badge, and the half of "exactly one" a database can state.
ALTER TABLE "customer_tiers" ADD COLUMN "isDefault" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_tiers_one_default_idx" ON "customer_tiers" USING btree ("isDefault") WHERE "customer_tiers"."isDefault";--> statement-breakpoint

-- The list every existing deployment already had, now written down. It keeps
-- the key `default` so a catalog file's `price:default` column goes on
-- addressing the same list; the label is English because a migration has no
-- deployment text to read from, and is renamed once in the admin UI.
INSERT INTO "customer_tiers" ("key", "label", "sortOrder", "isDefault")
VALUES ('default', 'Base price list',
        coalesce((SELECT min("sortOrder") - 1 FROM "customer_tiers"), 0), true);--> statement-breakpoint

-- Every product's base price becomes a row in that list. The column is NOT
-- NULL, so no product loses a price here; products with none at all can only
-- arrive later, from a source system that exports products and prices apart.
INSERT INTO "product_prices" ("productId", "tierId", "priceMinor")
SELECT p."id", t."id", p."defaultPriceMinor"
  FROM "products" p
 CROSS JOIN (SELECT "id" FROM "customer_tiers" WHERE "isDefault") t;--> statement-breakpoint

ALTER TABLE "products" DROP COLUMN "defaultPriceMinor";--> statement-breakpoint

-- A deployment that wrote a zero into the old column meant "not priced" —
-- there was no other way to say it while the column was NOT NULL. It is said
-- by the absence of the row now, so those rows go before the check below can
-- be stated. Such a product ends up unpriced and comes off the storefront,
-- which is what a zero already meant everywhere it was read.
DELETE FROM "product_prices" WHERE "priceMinor" <= 0;--> statement-breakpoint

-- A price is a positive amount of money. "Not priced" is this row's absence
-- and has no second spelling: a zero would read on every screen as a product
-- given away, and a negative one never meant anything.
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_positive" CHECK ("product_prices"."priceMinor" > 0);
