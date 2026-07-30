CREATE TYPE "public"."sync_run_source" AS ENUM('upload', 'api');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('previewed', 'applied', 'failed');--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "sync_run_status" DEFAULT 'previewed' NOT NULL,
	"source" "sync_run_source" DEFAULT 'upload' NOT NULL,
	"filename" text,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"finishedAt" timestamp with time zone,
	"actorId" uuid,
	"actorEmail" varchar(255),
	"options" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"rows" jsonb,
	"parseErrors" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;