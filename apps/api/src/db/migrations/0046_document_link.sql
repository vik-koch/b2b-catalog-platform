ALTER TABLE "documents" ALTER COLUMN "fileUrl" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "fileName" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "contentType" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "byteSize" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_whole" CHECK (("documents"."fileUrl" is null) = ("documents"."fileName" is null)
        and ("documents"."fileUrl" is null) = ("documents"."contentType" is null)
        and ("documents"."fileUrl" is null) = ("documents"."byteSize" is null));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_or_link" CHECK ("documents"."fileUrl" is not null or "documents"."link" is not null);