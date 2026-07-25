ALTER TABLE "pages" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "updatedBy" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;