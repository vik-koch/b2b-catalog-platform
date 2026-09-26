CREATE TABLE "catalog_attributes" (
	"attributeId" uuid PRIMARY KEY NOT NULL,
	"sortOrder" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_attributes" ADD CONSTRAINT "catalog_attributes_attributeId_attribute_definitions_id_fk" FOREIGN KEY ("attributeId") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;