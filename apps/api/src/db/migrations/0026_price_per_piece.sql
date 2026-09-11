-- A price is now the price of one piece, so the basis is converted away before
-- the columns holding it go.
--
-- Catalog prices are divided down and the products are **unpublished**: the
-- division rounds, and a rounded price is one a person has to look at. The
-- publication gate is where that review already happens, and an unpublished
-- product announces itself in the work queue, so the deploy needs no hands.
UPDATE "product_prices" SET "priceMinor" = round("priceMinor"::numeric / p."priceBasisPieces")
  FROM "products" p
 WHERE p.id = "product_prices"."productId" AND p."priceBasisPieces" > 1;--> statement-breakpoint
UPDATE "products"
   SET "defaultPriceMinor" = round("defaultPriceMinor"::numeric / "priceBasisPieces"),
       "publishedAt" = null
 WHERE "priceBasisPieces" > 1;--> statement-breakpoint

-- Order lines are history, and history is not rounded: what a customer was
-- charged stands. A line whose total does not divide into whole pieces has no
-- per-piece price to convert to, so the migration stops rather than restating
-- somebody's order. No catalog has been able to produce such a line without a
-- basis above one, which no deployment has ever stored.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "order_items"
              WHERE "priceBasisPieces" > 1 AND "lineTotalMinor" % "pieces" <> 0) THEN
    RAISE EXCEPTION 'order lines priced per several pieces cannot be converted to a per-piece price without rounding a past order; convert them by hand before deploying';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantities_positive";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_total_exact";--> statement-breakpoint
-- After the old rule is gone and before the new one arrives: in between, a
-- line's price is per piece while the column saying otherwise is still there.
UPDATE "order_items" SET "priceMinor" = "lineTotalMinor" / "pieces"
 WHERE "priceBasisPieces" > 1;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_basis_divides_quantities";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_units_positive";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "priceBasisPieces";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "priceBasisPieces";--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantities_positive" CHECK ("order_items"."quantity" > 0 and "order_items"."pieces" >= 1);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_total_exact" CHECK ("order_items"."lineTotalMinor" = "order_items"."priceMinor" * "order_items"."pieces");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_units_positive" CHECK ("products"."minPieceQty" >= 1
        and "products"."boxCount" >= 1
        and ("products"."piecesPerPack" is null or "products"."piecesPerPack" >= 1)
        and ("products"."packsPerBox" is null or "products"."packsPerBox" >= 1));