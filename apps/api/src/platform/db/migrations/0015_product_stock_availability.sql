CREATE TYPE "public"."product_availability" AS ENUM('out', 'low', 'in');--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stockPieces" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lowStockThresholdPieces" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "availability" "product_availability";--> statement-breakpoint
CREATE INDEX "products_availability_idx" ON "products" USING btree ("availability");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_availability_tracks_stock" CHECK (("products"."stockPieces" is null) = ("products"."availability" is null));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_low_stock_threshold_positive" CHECK ("products"."lowStockThresholdPieces" is null
        or ("products"."lowStockThresholdPieces" >= 1 and "products"."stockPieces" is not null));