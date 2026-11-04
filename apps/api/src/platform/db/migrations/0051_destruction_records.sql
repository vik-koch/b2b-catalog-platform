CREATE TABLE "destruction_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" varchar(16) NOT NULL,
	"subjectId" uuid NOT NULL,
	"categories" varchar(32)[] NOT NULL,
	"reason" varchar(32) NOT NULL,
	"destroyedBy" uuid,
	"destroyedByEmail" varchar(320),
	"destroyedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destruction_records_subject" CHECK ("subject" in ('account', 'consent')),
	CONSTRAINT "destruction_records_reason" CHECK ("reason" in ('request', 'consent-withdrawn', 'registration-declined', 'retention-ended')),
	CONSTRAINT "destruction_records_categories" CHECK (cardinality("categories") > 0 and "categories" <@ array['account-details', 'addresses', 'order-details', 'order-documents', 'consent-record']::varchar[])
);
--> statement-breakpoint
CREATE INDEX "destruction_records_destroyedAt_idx" ON "destruction_records" USING btree ("destroyedAt");--> statement-breakpoint
CREATE INDEX "destruction_records_subjectId_idx" ON "destruction_records" USING btree ("subjectId");--> statement-breakpoint

-- Hand-written: drizzle does not model triggers. The function is 0048's.
CREATE TRIGGER "destruction_records_refuse_update" BEFORE UPDATE ON "destruction_records" FOR EACH ROW EXECUTE FUNCTION "refuse_update"();
