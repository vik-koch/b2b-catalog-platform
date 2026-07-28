CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"maintenanceMode" boolean DEFAULT false NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The singleton row, so reads never find it absent. Maintenance defaults off;
-- a deployment that wants the pre-launch gate on flips it via the admin panel
-- after first boot (or a prod bootstrap can set it).
INSERT INTO "app_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;