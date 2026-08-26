-- A piece quantity now moves by one pack rather than by the minimum, so the
-- minimum has to sit on that lattice. Existing rows are raised to the next
-- whole pack first — upward, which is the direction the quantity rules already
-- correct in, and never below what the shop said it would sell.
UPDATE "products"
   SET "minPieceQty" = "piecesPerPack" * ceil("minPieceQty"::numeric / "piecesPerPack")
 WHERE "piecesPerPack" is not null
   AND "minPieceQty" % "piecesPerPack" <> 0;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_minimum_is_whole_packs" CHECK ("products"."piecesPerPack" is null
        or "products"."minPieceQty" % "products"."piecesPerPack" = 0);
