CREATE TABLE "order_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"fileKey" varchar(128) NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"contentType" varchar(100) NOT NULL,
	"byteSize" integer NOT NULL,
	"suppliedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"notifiedAt" timestamp with time zone,
	"suppliedBy" uuid,
	"suppliedForRevision" integer NOT NULL,
	CONSTRAINT "order_documents_kind_known" CHECK ("kind" in ('payment-instructions', 'order-summary')),
	CONSTRAINT "order_documents_size_positive" CHECK ("order_documents"."byteSize" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_suppliedBy_users_id_fk" FOREIGN KEY ("suppliedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_documents_order_kind_idx" ON "order_documents" USING btree ("orderId","kind");