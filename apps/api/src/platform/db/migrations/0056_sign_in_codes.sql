CREATE TYPE "public"."sign_in_code_purpose" AS ENUM('sign-in', 'confirm');--> statement-breakpoint
CREATE TABLE "sign_in_codes" (
	"userId" uuid PRIMARY KEY NOT NULL,
	"purpose" "sign_in_code_purpose" NOT NULL,
	"phone" varchar(50) NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sends" integer DEFAULT 1 NOT NULL,
	"sentAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phoneConfirmedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sign_in_codes" ADD CONSTRAINT "sign_in_codes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A number is confirmed only by the write that confirms it. Any other change
-- to `phone` (staff, an external system, anonymization) leaves it unconfirmed.
CREATE FUNCTION "users_phone_unconfirm"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."phone" IS DISTINCT FROM OLD."phone"
     AND NEW."phoneConfirmedAt" IS NOT DISTINCT FROM OLD."phoneConfirmedAt" THEN
    NEW."phoneConfirmedAt" := NULL;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "users_phone_unconfirm" BEFORE UPDATE OF "phone" ON "users" FOR EACH ROW EXECUTE FUNCTION "users_phone_unconfirm"();
