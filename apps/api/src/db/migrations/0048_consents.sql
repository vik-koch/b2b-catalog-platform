CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" varchar(16) NOT NULL,
	"pageVersionId" uuid NOT NULL,
	"userId" uuid,
	"email" varchar(320),
	"phone" varchar(50),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_purpose" CHECK ("purpose" in ('contact', 'account')),
	CONSTRAINT "consents_names_someone" CHECK ("consents"."email" is not null or "consents"."phone" is not null)
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_pageVersionId_page_versions_id_fk" FOREIGN KEY ("pageVersionId") REFERENCES "public"."page_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_userId_idx" ON "consents" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "consents_email_idx" ON "consents" USING btree ("email");--> statement-breakpoint
CREATE INDEX "consents_phone_idx" ON "consents" USING btree ("phone");