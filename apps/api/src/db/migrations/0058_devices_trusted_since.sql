ALTER TABLE "users" ADD COLUMN "devicesTrustedSince" timestamp with time zone;--> statement-breakpoint
-- The one trigger that keeps sign-in trust honest, now also watching `status`.
-- A changed number is unconfirmed unless the write confirms it, and forgets
-- every remembered browser; so does an account being disabled or anonymized.
DROP TRIGGER "users_phone_unconfirm" ON "users";--> statement-breakpoint
DROP FUNCTION "users_phone_unconfirm"();--> statement-breakpoint
CREATE FUNCTION "users_sign_in_trust"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."phone" IS DISTINCT FROM OLD."phone" THEN
    IF NEW."phoneConfirmedAt" IS NOT DISTINCT FROM OLD."phoneConfirmedAt" THEN
      NEW."phoneConfirmedAt" := NULL;
    END IF;
    NEW."devicesTrustedSince" := now();
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status"
     AND NEW."status" IN ('disabled', 'anonymized') THEN
    NEW."devicesTrustedSince" := now();
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "users_sign_in_trust" BEFORE UPDATE OF "phone", "status" ON "users" FOR EACH ROW EXECUTE FUNCTION "users_sign_in_trust"();
