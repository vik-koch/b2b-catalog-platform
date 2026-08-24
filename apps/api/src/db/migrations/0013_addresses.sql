CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"label" varchar(100),
	"companyName" varchar(255),
	"companyId" varchar(64),
	"street" varchar(255) NOT NULL,
	"street2" varchar(255),
	"postalCode" varchar(32) NOT NULL,
	"city" varchar(255) NOT NULL,
	"region" varchar(255),
	"country" varchar(2) NOT NULL,
	"phone" varchar(50),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_userId_idx" ON "addresses" USING btree ("userId");