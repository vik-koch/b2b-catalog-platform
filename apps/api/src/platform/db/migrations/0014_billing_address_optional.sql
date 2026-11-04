ALTER TABLE "orders" ALTER COLUMN "billingStreet" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "billingPostalCode" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "billingCity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "billingCountry" DROP NOT NULL;