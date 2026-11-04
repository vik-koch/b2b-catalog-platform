CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"fileUrl" text NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"contentType" varchar(100) NOT NULL,
	"byteSize" integer NOT NULL,
	"issuedAt" date,
	"expiresAt" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_expiresAt_idx" ON "documents" USING btree ("expiresAt");