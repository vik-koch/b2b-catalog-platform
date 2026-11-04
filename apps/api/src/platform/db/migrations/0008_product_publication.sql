ALTER TABLE "products" ADD COLUMN "publishedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "publishedBy" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_publishedBy_users_id_fk" FOREIGN KEY ("publishedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Everything that exists today is already public, so publish it. Without this
-- the gate would take the whole catalog off the storefront on deploy.
-- `createdAt` rather than now(): the row has been visible since it was written,
-- and that is the honest date. `publishedBy` stays null — nobody decided.
UPDATE "products" SET "publishedAt" = "createdAt" WHERE "deletedAt" IS NULL;
