CREATE TABLE "category_attributes" (
	"categoryId" uuid NOT NULL,
	"attributeId" uuid NOT NULL,
	"sortOrder" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "category_attributes_categoryId_attributeId_pk" PRIMARY KEY("categoryId","attributeId")
);
--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_categoryId_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_attributeId_attribute_definitions_id_fk" FOREIGN KEY ("attributeId") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;