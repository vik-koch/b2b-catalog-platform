ALTER TABLE "destruction_records" DROP CONSTRAINT "destruction_records_subject";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "personalDataRemovedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_subject" CHECK ("subject" in ('account', 'consent', 'order'));--> statement-breakpoint
-- Orders of accounts deleted before this column existed were scrubbed then;
-- mark them as of the deletion, so the retention sweep leaves them alone.
UPDATE "orders" SET "personalDataRemovedAt" = u."updatedAt"
  FROM "users" u
 WHERE "orders"."userId" = u."id" AND u."status" = 'anonymized';
