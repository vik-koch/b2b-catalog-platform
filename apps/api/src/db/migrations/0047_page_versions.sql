CREATE TABLE "page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"bodyHtml" text NOT NULL,
	"consentLabel" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" uuid,
	"createdByEmail" varchar(255),
	CONSTRAINT "page_versions_version_positive" CHECK ("page_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_slug_version" ON "page_versions" USING btree ("slug","version");--> statement-breakpoint
-- Each page as it stands becomes its first version, keeping when and by whom it
-- was last saved.
INSERT INTO "page_versions" ("slug", "version", "title", "bodyHtml", "createdAt", "createdBy", "createdByEmail")
SELECT p."id", 1, p."title", p."bodyHtml", p."updatedAt", p."updatedBy", u."email"
FROM "pages" p LEFT JOIN "users" u ON u."id" = p."updatedBy";--> statement-breakpoint
DROP TABLE "pages";