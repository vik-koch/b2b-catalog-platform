CREATE TYPE "public"."ownership_area" AS ENUM('catalog');--> statement-breakpoint
CREATE TYPE "public"."setting_change_kind" AS ENUM('maintenance', 'ownership');--> statement-breakpoint
CREATE TABLE "setting_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "setting_change_kind" NOT NULL,
	"area" varchar(40),
	"enabled" boolean NOT NULL,
	"changedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"changedBy" uuid,
	"changedByEmail" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "externallyOwnedAreas" "ownership_area"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_changedBy_users_id_fk" FOREIGN KEY ("changedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;