ALTER TABLE "product_attributes" ADD COLUMN "part" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "parts" text[] DEFAULT '{}'::text[] NOT NULL;