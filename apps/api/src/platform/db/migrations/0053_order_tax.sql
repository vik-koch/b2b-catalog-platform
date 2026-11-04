ALTER TABLE "order_items" ADD COLUMN "taxRate" numeric(5, 2);--> statement-breakpoint
-- Orders placed before the basis was recorded read as charging no tax: they
-- carry no line rates, so `none` is the one basis that cannot contradict them.
-- The default exists only to fill those rows; the snapshot has none.
ALTER TABLE "orders" ADD COLUMN "taxBasis" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "taxBasis" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tax_rate_percent" CHECK ("order_items"."taxRate" is null or "order_items"."taxRate" between 0 and 100);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tax_basis_known" CHECK ("taxBasis" in ('included', 'added', 'none'));