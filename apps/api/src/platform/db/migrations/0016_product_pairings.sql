CREATE TABLE "product_pairings" (
	"productAId" uuid NOT NULL,
	"productBId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_pairings_productAId_productBId_pk" PRIMARY KEY("productAId","productBId"),
	CONSTRAINT "product_pairings_canonical_order" CHECK ("product_pairings"."productAId" < "product_pairings"."productBId")
);
--> statement-breakpoint
ALTER TABLE "product_pairings" ADD CONSTRAINT "product_pairings_productAId_products_id_fk" FOREIGN KEY ("productAId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pairings" ADD CONSTRAINT "product_pairings_productBId_products_id_fk" FOREIGN KEY ("productBId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_pairings_productBId_idx" ON "product_pairings" USING btree ("productBId");