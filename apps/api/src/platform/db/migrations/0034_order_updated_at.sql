ALTER TABLE "orders" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_updatedAt_idx" ON "orders" USING btree ("updatedAt","id");--> statement-breakpoint
-- Backfilled rather than left at `now()`: the column is what the outbound read
-- orders and pages by, and a book of orders that all changed at the same
-- instant has no order at all. The true value is the latest of the four things
-- that write an order — it was placed, it moved, it was paid, a version of it
-- was written — and every one of them is already recorded.
UPDATE "orders" SET "updatedAt" = greatest(
  "orders"."createdAt",
  "orders"."statusChangedAt",
  coalesce("orders"."paidAt", "orders"."createdAt"),
  coalesce((select max("order_revisions"."createdAt") from "order_revisions"
    where "order_revisions"."orderId" = "orders"."id"), "orders"."createdAt")
);
