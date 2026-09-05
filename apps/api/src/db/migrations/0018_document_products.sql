CREATE TABLE "document_products" (
	"documentId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_products_documentId_productId_pk" PRIMARY KEY("documentId","productId")
);
--> statement-breakpoint
ALTER TABLE "document_products" ADD CONSTRAINT "document_products_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_products" ADD CONSTRAINT "document_products_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_products_productId_idx" ON "document_products" USING btree ("productId");