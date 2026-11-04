ALTER TABLE "users" ADD COLUMN "signInStepExemptAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signInStepExemptBy" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_signInStepExemptBy_users_id_fk" FOREIGN KEY ("signInStepExemptBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;