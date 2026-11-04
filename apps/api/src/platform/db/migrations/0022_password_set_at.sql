ALTER TABLE "users" ADD COLUMN "passwordSetAt" timestamp with time zone;
--> statement-breakpoint
-- Every account that can sign in today holds a password its owner chose, so
-- the column is filled from the only date the row has for it. `disabled` rows
-- are deliberately left null: deactivation used to retire the password, so
-- those accounts really have none and come back as `invited`.
UPDATE "users" SET "passwordSetAt" = "updatedAt" WHERE "status" = 'active';
