ALTER TABLE "categories" ADD COLUMN "updatedBy" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updatedBy" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deletedBy" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_deletedBy_users_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;