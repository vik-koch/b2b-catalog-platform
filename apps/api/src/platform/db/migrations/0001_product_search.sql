-- Product name search. Hand-extended after `drizzle-kit generate`:
-- the extensions and the wrapper function below are not expressible
-- in the drizzle schema, but the generated column and both indexes
-- that follow them are, and were generated from it.

-- Both are trusted extensions (PG13+), so the database owner may create them
-- without superuser. `unaccent` folds accents for matching; `pg_trgm` provides
-- the similarity operator and the GIN opclass behind the typo tolerance.
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint

-- `unaccent(text)` is STABLE, not IMMUTABLE — it resolves the default text
-- search dictionary at call time — so it cannot appear in a generated column or
-- an index expression. This wrapper pins the dictionary explicitly, which makes
-- the result a pure function of the input and lets Postgres accept it in both.
-- Every query that wants either index must call this same wrapper.
CREATE OR REPLACE FUNCTION search_unaccent(text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint

ALTER TABLE "products" ADD COLUMN "nameTsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_unaccent("name"))) STORED;--> statement-breakpoint
CREATE INDEX "products_nameTsv_idx" ON "products" USING gin ("nameTsv");--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin (search_unaccent("name") gin_trgm_ops);
