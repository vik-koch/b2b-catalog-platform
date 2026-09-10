CREATE TYPE "public"."api_token_scope" AS ENUM('catalog-sync');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"scopes" "api_token_scope"[] NOT NULL,
	"prefix" varchar(8) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" uuid,
	"createdByEmail" varchar(255),
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	CONSTRAINT "api_tokens_tokenHash_unique" UNIQUE("tokenHash"),
	CONSTRAINT "api_tokens_scopes_not_empty" CHECK (array_length("api_tokens"."scopes", 1) >= 1)
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;