ALTER TABLE "categories" ALTER COLUMN "sourceId" DROP NOT NULL;--> statement-breakpoint
-- Categories created in the admin were given a minted `manual:<uuid>` key so
-- the column could be NOT NULL. It bound them to nothing: no export contains
-- it, and carrying one made a shop-invented category look like the exchange's
-- to write. They have no key.
UPDATE "categories" SET "sourceId" = NULL WHERE "sourceId" LIKE 'manual:%';
