-- Rename the category sync key to match the product one (`products.sourceId`).
-- The old `sourceKey` name was gratuitously inconsistent; both columns are the
-- same concept — the private upsert identity from the source system.
ALTER TABLE "categories" RENAME COLUMN "sourceKey" TO "sourceId";--> statement-breakpoint
ALTER TABLE "categories" RENAME CONSTRAINT "categories_sourceKey_unique" TO "categories_sourceId_unique";
