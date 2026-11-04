CREATE TABLE "order_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"revisionNumber" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" uuid,
	"note" varchar(500),
	"contactName" varchar(200) NOT NULL,
	"contactEmail" varchar(255) NOT NULL,
	"contactPhone" varchar(50) NOT NULL,
	"paymentMethod" varchar(20) NOT NULL,
	"fulfilmentMethod" varchar(20) NOT NULL,
	"partyName" varchar(255) NOT NULL,
	"partyRegistrationId" varchar(64),
	"billingStreet" varchar(255),
	"billingStreet2" varchar(255),
	"billingPostalCode" varchar(32),
	"billingCity" varchar(255),
	"billingRegion" varchar(255),
	"billingCountry" varchar(2),
	"deliveryStreet" varchar(255),
	"deliveryStreet2" varchar(255),
	"deliveryPostalCode" varchar(32),
	"deliveryCity" varchar(255),
	"deliveryRegion" varchar(255),
	"deliveryCountry" varchar(2),
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
	CONSTRAINT "order_revisions_number_positive" CHECK ("order_revisions"."revisionNumber" >= 1),
	CONSTRAINT "order_revisions_payment_known" CHECK ("paymentMethod" in ('cash', 'bank-transfer', 'card-later')),
	CONSTRAINT "order_revisions_fulfilment_known" CHECK ("fulfilmentMethod" in ('delivery', 'pickup')),
	CONSTRAINT "order_revisions_fulfilment_destination" CHECK (case when "order_revisions"."fulfilmentMethod" = 'delivery'
        then "order_revisions"."deliveryStreet" is not null
          and "order_revisions"."deliveryPostalCode" is not null
          and "order_revisions"."deliveryCity" is not null
          and "order_revisions"."deliveryCountry" is not null
          and "order_revisions"."pickupLocationKey" is null
        else "order_revisions"."pickupLocationKey" is not null
          and "order_revisions"."deliveryStreet" is null
        end)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "revisionId" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currentRevisionId" uuid;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_revisions_order_number_idx" ON "order_revisions" USING btree ("orderId","revisionNumber");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_revisionId_order_revisions_id_fk" FOREIGN KEY ("revisionId") REFERENCES "public"."order_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_currentRevisionId_order_revisions_id_fk" FOREIGN KEY ("currentRevisionId") REFERENCES "public"."order_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every order that exists was submitted once and never adjusted, so each gets
-- revision 1, carrying the snapshot it has always had. Written by nobody: the
-- customer placed it, and `createdBy` names a member of staff.
INSERT INTO "order_revisions" ("orderId", "revisionNumber", "createdAt",
  "contactName", "contactEmail", "contactPhone", "paymentMethod",
  "fulfilmentMethod", "partyName", "partyRegistrationId", "billingStreet",
  "billingStreet2", "billingPostalCode", "billingCity", "billingRegion",
  "billingCountry", "deliveryStreet", "deliveryStreet2",
  "deliveryPostalCode", "deliveryCity", "deliveryRegion", "deliveryCountry",
  "deliveryZoneKey", "deliveryFreeFromMinor", "pickupLocationKey",
  "pickupLocationName", "pickupLocationAddress", "preferredDate",
  "customerNote", "totalMinor", "shipmentCartons", "shipmentVolume",
  "shipmentWeight", "shipmentApproximate", "shipmentUncoveredLines",
  "currency", "tierKey")
SELECT o."id", 1, o."createdAt",
  o."contactName", o."contactEmail", o."contactPhone", o."paymentMethod",
  o."fulfilmentMethod", o."partyName", o."partyRegistrationId",
  o."billingStreet", o."billingStreet2", o."billingPostalCode",
  o."billingCity", o."billingRegion", o."billingCountry", o."deliveryStreet",
  o."deliveryStreet2", o."deliveryPostalCode", o."deliveryCity",
  o."deliveryRegion", o."deliveryCountry", o."deliveryZoneKey",
  o."deliveryFreeFromMinor", o."pickupLocationKey", o."pickupLocationName",
  o."pickupLocationAddress", o."preferredDate", o."customerNote",
  o."totalMinor", o."shipmentCartons", o."shipmentVolume",
  o."shipmentWeight", o."shipmentApproximate", o."shipmentUncoveredLines",
  o."currency", o."tierKey"
  FROM "orders" o;--> statement-breakpoint
UPDATE "orders" o SET "currentRevisionId" = r."id"
  FROM "order_revisions" r WHERE r."orderId" = o."id";--> statement-breakpoint
UPDATE "order_items" i SET "revisionId" = o."currentRevisionId"
  FROM "orders" o WHERE o."id" = i."orderId";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_known";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilment_known";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilment_destination";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_orderId_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_orderId_sortOrder_pk";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "revisionId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_revisionId_sortOrder_pk" PRIMARY KEY("revisionId","sortOrder");--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "orderId";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "contactName";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "contactEmail";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "contactPhone";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "paymentMethod";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "fulfilmentMethod";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "partyName";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "partyRegistrationId";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "billingStreet";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "billingStreet2";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "billingPostalCode";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "billingCity";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "billingRegion";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "billingCountry";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryStreet";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryStreet2";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryPostalCode";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryCity";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryRegion";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryCountry";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryZoneKey";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "deliveryFreeFromMinor";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "pickupLocationKey";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "pickupLocationName";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "pickupLocationAddress";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "preferredDate";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "customerNote";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "totalMinor";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipmentCartons";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipmentVolume";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipmentWeight";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipmentApproximate";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipmentUncoveredLines";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "tierKey";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_known";--> statement-breakpoint
ALTER TABLE "order_revisions" ADD COLUMN "kind" varchar(20) DEFAULT 'adjustment' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD COLUMN "status" varchar(20) DEFAULT 'requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD COLUMN "statusReason" varchar(500);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customerRevisionId" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerRevisionId_order_revisions_id_fk" FOREIGN KEY ("customerRevisionId") REFERENCES "public"."order_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_status_known" CHECK ("status" in ('requested', 'approved', 'ready', 'completed', 'declined', 'cancelled'));--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_kind_known" CHECK ("kind" in ('submitted', 'transition', 'adjustment'));--> statement-breakpoint
-- `adjusted` was an acceptance with a second name. It is now what it always
-- was: an approved order that happens to be on a later version.
UPDATE "orders" SET "status" = 'approved' WHERE "status" = 'adjusted';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_known" CHECK ("status" in ('requested', 'approved', 'ready', 'completed', 'declined', 'cancelled'));--> statement-breakpoint
-- Every version gets the two things it now has to say. Version 1 is what the
-- customer sent; anything after it was the shop changing the order, which is
-- the only kind of version that could exist before this migration. The order's
-- own status lands on the version it stands on, and the ones behind it read as
-- still waiting — which is what a thread of versions looks like from outside.
UPDATE "order_revisions" r
  SET "kind" = case when r."revisionNumber" = 1
                    then 'submitted' else 'adjustment' end,
      "status" = case when r."id" = o."currentRevisionId"
                      then o."status" else 'requested' end,
      "statusReason" = case when r."id" = o."currentRevisionId"
                            then o."statusReason" end
  FROM "orders" o WHERE o."id" = r."orderId";--> statement-breakpoint
-- What the customer has been shown all along: there is nothing else to show.
UPDATE "orders" SET "customerRevisionId" = "currentRevisionId";
--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "statusReason";
--> statement-breakpoint
ALTER TABLE "order_revisions" ADD COLUMN "notifiedAt" timestamp with time zone;
