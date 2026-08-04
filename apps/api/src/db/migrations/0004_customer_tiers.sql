CREATE TABLE "customer_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(255) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid,
	CONSTRAINT "customer_tiers_key_unique" UNIQUE("key"),
	CONSTRAINT "customer_tiers_key_not_default" CHECK ("customer_tiers"."key" <> 'default')
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"productId" uuid NOT NULL,
	"tierId" uuid NOT NULL,
	"priceMinor" integer NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_productId_tierId_pk" PRIMARY KEY("productId","tierId")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tierId" uuid;--> statement-breakpoint
ALTER TABLE "customer_tiers" ADD CONSTRAINT "customer_tiers_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_tierId_customer_tiers_id_fk" FOREIGN KEY ("tierId") REFERENCES "public"."customer_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_prices_tierId_idx" ON "product_prices" USING btree ("tierId");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tierId_customer_tiers_id_fk" FOREIGN KEY ("tierId") REFERENCES "public"."customer_tiers"("id") ON DELETE restrict ON UPDATE no action;
