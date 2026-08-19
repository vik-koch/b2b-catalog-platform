CREATE TABLE "product_attributes" (
	"productId" uuid NOT NULL,
	"sortOrder" integer NOT NULL,
	"key" varchar(200) NOT NULL,
	"value" varchar(2000) NOT NULL,
	"valueNumeric" numeric(18, 6),
	CONSTRAINT "product_attributes_productId_sortOrder_pk" PRIMARY KEY("productId","sortOrder")
);
--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_attributes_key_value_idx" ON "product_attributes" USING btree ("key","value");--> statement-breakpoint
-- Backfill from the jsonb column. Array position becomes sortOrder; values are
-- trimmed (the one normalization attributes get) and parsed into valueNumeric
-- with the same rule as parseAttributeNumber in libs/shared.
INSERT INTO "product_attributes" ("productId", "sortOrder", "key", "value", "valueNumeric")
SELECT
  p.id,
  entry.ordinality - 1,
  btrim(entry.item ->> 'key'),
  btrim(entry.item ->> 'value'),
  CASE
    WHEN btrim(entry.item ->> 'value') ~ '^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$'
     AND abs(btrim(entry.item ->> 'value')::numeric) < 1e12
    THEN round(btrim(entry.item ->> 'value')::numeric, 6)
  END
FROM "products" p
CROSS JOIN LATERAL jsonb_array_elements(p."attributes")
  WITH ORDINALITY AS entry(item, ordinality)
WHERE jsonb_typeof(p."attributes") = 'array'
  AND entry.item ->> 'key' IS NOT NULL
  AND entry.item ->> 'value' IS NOT NULL;--> statement-breakpoint
-- The drop below is a one-way door, so the backfill is counted against the
-- jsonb it came from and the whole migration aborts on any discrepancy.
DO $$
DECLARE
  expected bigint;
  copied bigint;
BEGIN
  SELECT coalesce(sum(jsonb_array_length("attributes")), 0) INTO expected
    FROM "products" WHERE jsonb_typeof("attributes") = 'array';
  SELECT count(*) INTO copied FROM "product_attributes";
  IF expected <> copied THEN
    RAISE EXCEPTION 'attribute backfill mismatch: % jsonb entries, % rows copied', expected, copied;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "attributes";
