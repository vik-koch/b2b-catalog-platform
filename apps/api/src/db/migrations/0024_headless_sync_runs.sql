CREATE TYPE "public"."sync_staged_reason" AS ENUM('policy', 'requested');--> statement-breakpoint
ALTER TYPE "public"."sync_run_status" ADD VALUE 'no-change';--> statement-breakpoint
ALTER TYPE "public"."sync_run_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TYPE "public"."sync_run_status" ADD VALUE 'discarded';--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "options" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "summary" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "tokenId" uuid;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "tokenName" varchar(80);--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "stagedReason" "sync_staged_reason";--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tokenId_api_tokens_id_fk" FOREIGN KEY ("tokenId") REFERENCES "public"."api_tokens"("id") ON DELETE no action ON UPDATE no action;