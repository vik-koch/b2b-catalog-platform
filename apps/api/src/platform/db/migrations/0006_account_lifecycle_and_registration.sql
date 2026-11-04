CREATE TYPE "public"."customer_type" AS ENUM('person', 'company');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'invited', 'active', 'disabled', 'anonymized');--> statement-breakpoint
CREATE TABLE "password_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_tokens_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "firstName" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lastName" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "customerType" "customer_type";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "companyRegistrationId" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approvedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approvedBy" uuid;--> statement-breakpoint
ALTER TABLE "password_tokens" ADD CONSTRAINT "password_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Data-only backfill (no schema change, so the drizzle snapshot still holds):
-- every account that exists before registration does was created by staff and
-- can already sign in. The column default is `pending`, so without this they
-- would all be locked out — including the bootstrap admin.
UPDATE "users" SET "status" = 'active';
