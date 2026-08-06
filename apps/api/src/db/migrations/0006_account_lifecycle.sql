CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'anonymized');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approvedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approvedBy" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Data-only backfill (no schema change, so the drizzle snapshot still holds):
-- every account that exists before registration does was created by staff and
-- can already sign in. The column default is `pending`, so without this they
-- would all be locked out — including the bootstrap admin.
UPDATE "users" SET "status" = 'active';