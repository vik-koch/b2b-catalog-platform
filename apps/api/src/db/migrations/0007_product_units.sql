ALTER TABLE "products" ADD COLUMN "priceBasisPieces" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "piecesPerPack" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "packsPerBox" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "minPieceQty" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "boxVolume" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "boxWeight" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_units_positive" CHECK ("products"."priceBasisPieces" >= 1 and "products"."minPieceQty" >= 1
        and ("products"."piecesPerPack" is null or "products"."piecesPerPack" >= 1)
        and ("products"."packsPerBox" is null or "products"."packsPerBox" >= 1));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_box_needs_pack" CHECK ("products"."packsPerBox" is null or "products"."piecesPerPack" is not null);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_basis_divides_quantities" CHECK ("products"."minPieceQty" % "products"."priceBasisPieces" = 0
        and ("products"."piecesPerPack" is null
             or "products"."piecesPerPack" % "products"."priceBasisPieces" = 0));