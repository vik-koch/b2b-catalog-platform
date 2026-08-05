ALTER TABLE "customer_tiers" ADD COLUMN "sortOrder" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Data-only backfill (no schema change, so the drizzle snapshot still holds):
-- existing tiers keep the order staff already see, which was by label.
UPDATE "customer_tiers" t
   SET "sortOrder" = o.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY label) AS rn FROM "customer_tiers"
  ) o
 WHERE t.id = o.id;
