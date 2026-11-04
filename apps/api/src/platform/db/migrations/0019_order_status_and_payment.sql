ALTER TABLE "orders" DROP CONSTRAINT "orders_status_known";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "statusReason" varchar(500);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paymentState" varchar(20) DEFAULT 'not-due' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paidAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paidBy" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paidBy_users_id_fk" FOREIGN KEY ("paidBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_state_known" CHECK ("paymentState" in ('not-due', 'awaiting', 'paid'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_recorded" CHECK (("orders"."paymentState" = 'paid') = ("orders"."paidAt" is not null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_known" CHECK ("status" in ('requested', 'approved', 'adjusted', 'ready', 'completed', 'declined', 'cancelled'));