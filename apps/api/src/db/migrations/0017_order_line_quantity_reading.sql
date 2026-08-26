-- A line's quantity is its piece count; the unit it was bought in is a lens on
-- that, so the reading can be a fraction of a box. `quantity` is that reading,
-- frozen for display, and `pieces` stays the integer everything is derived
-- from.
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantities_positive";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantities_positive" CHECK ("order_items"."quantity" > 0 and "order_items"."pieces" >= 1 and "order_items"."priceBasisPieces" >= 1);