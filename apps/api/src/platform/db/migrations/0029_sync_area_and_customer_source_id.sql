CREATE TYPE "public"."sync_area" AS ENUM('catalog', 'customers');--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "area" "sync_area" DEFAULT 'catalog' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sourceId" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sourceId_unique" UNIQUE("sourceId");
ALTER TYPE "public"."ownership_area" ADD VALUE 'customers';
