ALTER TABLE "products" DROP CONSTRAINT "products_units_positive";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "boxCount" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_box_count_needs_box" CHECK ("products"."boxCount" = 1 or "products"."packsPerBox" is not null);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_units_positive" CHECK ("products"."priceBasisPieces" >= 1 and "products"."minPieceQty" >= 1
        and "products"."boxCount" >= 1
        and ("products"."piecesPerPack" is null or "products"."piecesPerPack" >= 1)
        and ("products"."packsPerBox" is null or "products"."packsPerBox" >= 1));