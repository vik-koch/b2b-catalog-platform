CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"label" varchar(100),
	"street" varchar(255) NOT NULL,
	"street2" varchar(255),
	"postalCode" varchar(32) NOT NULL,
	"city" varchar(255) NOT NULL,
	"region" varchar(255),
	"country" varchar(2) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"orderId" uuid NOT NULL,
	"sortOrder" integer NOT NULL,
	"productId" uuid NOT NULL,
	"productSourceId" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(512) NOT NULL,
	"thumbnail" text,
	"unit" varchar(10) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"pieces" integer NOT NULL,
	"priceMinor" integer NOT NULL,
	"priceBasisPieces" integer NOT NULL,
	"lineTotalMinor" integer NOT NULL,
	"note" varchar(500),
	CONSTRAINT "order_items_orderId_sortOrder_pk" PRIMARY KEY("orderId","sortOrder"),
	CONSTRAINT "order_items_unit_known" CHECK ("unit" in ('piece', 'pack', 'box')),
	CONSTRAINT "order_items_quantities_positive" CHECK ("order_items"."quantity" > 0 and "order_items"."pieces" >= 1 and "order_items"."priceBasisPieces" >= 1),
	CONSTRAINT "order_items_total_exact" CHECK ("order_items"."pieces" % "order_items"."priceBasisPieces" = 0
        and "order_items"."lineTotalMinor" = "order_items"."priceMinor" * ("order_items"."pieces" / "order_items"."priceBasisPieces"))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(32) NOT NULL,
	"publicToken" varchar(64) NOT NULL,
	"userId" uuid,
	"status" varchar(20) DEFAULT 'requested' NOT NULL,
	"statusChangedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"statusChangedBy" uuid,
	"contactName" varchar(200) NOT NULL,
	"contactEmail" varchar(255) NOT NULL,
	"contactPhone" varchar(50) NOT NULL,
	"paymentMethod" varchar(20) NOT NULL,
	"fulfilmentMethod" varchar(20) NOT NULL,
	"partyName" varchar(255) NOT NULL,
	"partyRegistrationId" varchar(64),
	"billingStreet" varchar(255) NOT NULL,
	"billingStreet2" varchar(255),
	"billingPostalCode" varchar(32) NOT NULL,
	"billingCity" varchar(255) NOT NULL,
	"billingRegion" varchar(255),
	"billingCountry" varchar(2) NOT NULL,
	"billingAddressId" uuid,
	"deliveryStreet" varchar(255),
	"deliveryStreet2" varchar(255),
	"deliveryPostalCode" varchar(32),
	"deliveryCity" varchar(255),
	"deliveryRegion" varchar(255),
	"deliveryCountry" varchar(2),
	"deliveryAddressId" uuid,
	"deliveryZoneKey" varchar(64),
	"deliveryFreeFromMinor" integer,
	"pickupLocationKey" varchar(64),
	"pickupLocationName" varchar(255),
	"pickupLocationAddress" text,
	"preferredDate" date,
	"customerNote" text,
	"totalMinor" integer NOT NULL,
	"shipmentCartons" integer DEFAULT 0 NOT NULL,
	"shipmentVolume" numeric(12, 3),
	"shipmentWeight" numeric(12, 3),
	"shipmentApproximate" boolean DEFAULT false NOT NULL,
	"shipmentUncoveredLines" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) NOT NULL,
	"tierKey" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_reference_unique" UNIQUE("reference"),
	CONSTRAINT "orders_publicToken_unique" UNIQUE("publicToken"),
	CONSTRAINT "orders_status_known" CHECK ("status" in ('requested', 'approved', 'declined', 'cancelled')),
	CONSTRAINT "orders_payment_known" CHECK ("paymentMethod" in ('cash', 'bank-transfer', 'card-later')),
	CONSTRAINT "orders_fulfilment_known" CHECK ("fulfilmentMethod" in ('delivery', 'pickup')),
	CONSTRAINT "orders_fulfilment_destination" CHECK (case when "orders"."fulfilmentMethod" = 'delivery'
        then "orders"."deliveryStreet" is not null
          and "orders"."deliveryPostalCode" is not null
          and "orders"."deliveryCity" is not null
          and "orders"."deliveryCountry" is not null
          and "orders"."pickupLocationKey" is null
        else "orders"."pickupLocationKey" is not null
          and "orders"."deliveryStreet" is null
        end)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lineNoteEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lineNotePrompt" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "companyName" varchar(255);--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_statusChangedBy_users_id_fk" FOREIGN KEY ("statusChangedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_billingAddressId_addresses_id_fk" FOREIGN KEY ("billingAddressId") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryAddressId_addresses_id_fk" FOREIGN KEY ("deliveryAddressId") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_userId_idx" ON "addresses" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "orders_userId_idx" ON "orders" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "orders_createdAt_idx" ON "orders" USING btree ("createdAt");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_line_note_prompt_needs_note" CHECK ("products"."lineNotePrompt" is null or "products"."lineNoteEnabled");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_minimum_is_whole_packs" CHECK ("products"."piecesPerPack" is null
        or "products"."minPieceQty" % "products"."piecesPerPack" = 0);