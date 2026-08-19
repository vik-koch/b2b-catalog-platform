CREATE TYPE "public"."attribute_type" AS ENUM('text', 'number');--> statement-breakpoint
CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"type" "attribute_type" DEFAULT 'text' NOT NULL,
	"unit" varchar(32),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid,
	CONSTRAINT "attribute_definitions_name_unique" UNIQUE("name"),
	CONSTRAINT "attribute_definitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;