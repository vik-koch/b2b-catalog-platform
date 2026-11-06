CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Every account is already an identity, and every actor column names one.
INSERT INTO "identities" ("id", "createdAt") SELECT "id", "createdAt" FROM "users";--> statement-breakpoint
-- An account brings its identity on every path, raw SQL and the previous
-- release still running beside this migration included, and takes it along
-- when deleted: the actor columns naming it are cleared, or the delete is
-- refused, as when they referenced the account itself.
CREATE FUNCTION "users_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "identities" ("id") VALUES (NEW."id") ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;
  DELETE FROM "identities" WHERE "id" = OLD."id";
  RETURN OLD;
END $$;--> statement-breakpoint
CREATE TRIGGER "users_identity_insert" BEFORE INSERT ON "users" FOR EACH ROW EXECUTE FUNCTION "users_identity"();--> statement-breakpoint
CREATE TRIGGER "users_identity_delete" AFTER DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "users_identity"();
--> statement-breakpoint
ALTER TABLE "api_tokens" DROP CONSTRAINT "api_tokens_createdBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_updatedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "attribute_definitions" DROP CONSTRAINT "attribute_definitions_updatedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_updatedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "consent_withdrawals" DROP CONSTRAINT "consent_withdrawals_enteredBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_tiers" DROP CONSTRAINT "customer_tiers_updatedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_updatedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "order_documents" DROP CONSTRAINT "order_documents_suppliedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "order_revisions" DROP CONSTRAINT "order_revisions_createdBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_statusChangedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_paidBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_createdBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_updatedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_deletedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_publishedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "setting_changes" DROP CONSTRAINT "setting_changes_changedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_actorId_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_approvedBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_signInStepExemptBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_createdBy_identities_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updatedBy_identities_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_updatedBy_identities_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_updatedBy_identities_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_withdrawals" ADD CONSTRAINT "consent_withdrawals_enteredBy_identities_id_fk" FOREIGN KEY ("enteredBy") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tiers" ADD CONSTRAINT "customer_tiers_updatedBy_identities_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updatedBy_identities_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_suppliedBy_identities_id_fk" FOREIGN KEY ("suppliedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_createdBy_identities_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_statusChangedBy_identities_id_fk" FOREIGN KEY ("statusChangedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paidBy_identities_id_fk" FOREIGN KEY ("paidBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_createdBy_identities_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updatedBy_identities_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_deletedBy_identities_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_publishedBy_identities_id_fk" FOREIGN KEY ("publishedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_changedBy_identities_id_fk" FOREIGN KEY ("changedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_actorId_identities_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_identities_id_fk" FOREIGN KEY ("id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approvedBy_identities_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_signInStepExemptBy_identities_id_fk" FOREIGN KEY ("signInStepExemptBy") REFERENCES "public"."identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- What the services already clear, put right on rows from before they did:
-- a promotion drops the tier and the source key, a person the company fields.
UPDATE "users" SET "tierId" = NULL, "sourceId" = NULL WHERE "role" <> 'user' AND ("tierId" IS NOT NULL OR "sourceId" IS NOT NULL);--> statement-breakpoint
UPDATE "users" SET "companyName" = NULL, "companyRegistrationId" = NULL WHERE "customerType" IS DISTINCT FROM 'company' AND ("companyName" IS NOT NULL OR "companyRegistrationId" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_customer_only_fields" CHECK ("users"."role" = 'user' OR ("users"."tierId" IS NULL AND "users"."sourceId" IS NULL));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_fields_on_companies" CHECK ("users"."customerType" IS NOT DISTINCT FROM 'company' OR ("users"."companyName" IS NULL AND "users"."companyRegistrationId" IS NULL));