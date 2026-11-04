CREATE TABLE "consent_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consentId" uuid NOT NULL,
	"reason" varchar(32) NOT NULL,
	"withdrawnAt" timestamp with time zone DEFAULT now() NOT NULL,
	"enteredBy" uuid,
	"enteredByEmail" varchar(320),
	"note" varchar(500),
	CONSTRAINT "consent_withdrawals_consentId_unique" UNIQUE("consentId"),
	CONSTRAINT "consent_withdrawals_reason" CHECK ("reason" in ('account-deleted', 'registration-declined', 'entered')),
	CONSTRAINT "consent_withdrawals_entered_by_someone" CHECK ("reason" <> 'entered' or "enteredBy" is not null)
);
--> statement-breakpoint
ALTER TABLE "consent_withdrawals" ADD CONSTRAINT "consent_withdrawals_consentId_consents_id_fk" FOREIGN KEY ("consentId") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_withdrawals" ADD CONSTRAINT "consent_withdrawals_enteredBy_users_id_fk" FOREIGN KEY ("enteredBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Hand-written: drizzle does not model triggers. The function is 0048's.
CREATE TRIGGER "consent_withdrawals_refuse_update" BEFORE UPDATE ON "consent_withdrawals" FOR EACH ROW EXECUTE FUNCTION "refuse_update"();
