# 0030 — Search products with Postgres full-text search scored together with trigram word similarity

**Status:** accepted · **Date:** 2026-08-01

## Context

FR-SEARCH-01…03 ask for a header search bar matching **product names only**,
independent of word order, tolerant of minor typos, ordered by relevance. The
catalog is several hundred short names, single-language per deployment (i18n is
out of scope), containing accents and model designations.

`0002` already committed to searching inside Postgres rather than adding
Elasticsearch. This ADR settles _how_, because the two obvious mechanisms each
satisfy only half the requirement: **full-text search** gives word-order
independence and prefix matching but no typo tolerance at all, while **trigram
similarity** gives typo tolerance but scores whole strings, so a one-word query
scores poorly against a long name that contains it.

Also rejected: `levenshtein` (unindexable — a per-row edit distance over a
sequential scan) and a `spellfix1` vocabulary (SQLite-only, and a second
structure to keep in sync on every write).

## Decision

- **Both mechanisms, one score.** Candidates are selected by an OR of a
  `tsvector` match and a per-term trigram predicate; survivors are ranked by a
  combined score, `ORDER BY score DESC, name, id`.
- **`word_similarity`, not `similarity`, and averaged per term.** Each query
  term is scored against the best matching extent of the name, and the terms'
  scores averaged.
- **A stored generated `nameTsv` column** (`to_tsvector('simple', …)`) with a
  GIN index, plus a GIN `gin_trgm_ops` expression index on the unaccented name.
- **`simple`, not a stemming dictionary.** Accents and case are folded; nothing
  is stemmed, and no text-search configuration is chosen per deployment.
- **Queries are tokenized in application code**, never handed to `to_tsquery`
  raw: split on everything that is not a letter or digit, capped in length and
  term count (NFR-SEC-07), reassembled as an AND of prefix terms (`a:* & b:*`).
- **The trigram threshold is pinned per transaction** with `SET LOCAL`, not left
  to the server default.
- **One reusable matcher.** The storefront search and the admin grid's
  find-a-product box (FR-ADM-05) share it; the admin path adds an exact
  `sourceId` match and includes soft-deleted rows, which are never public.

## Rationale

1. **Neither mechanism alone meets FR-SEARCH-02**, which names word-order
   independence and typo tolerance in one sentence. Scoring both in one SQL
   expression beats running two queries and merging in TypeScript, where
   relevance ordering (FR-SEARCH-03) would have to be reinvented outside the
   database.
2. **The word-similarity variant is what makes the trigram half usable.** Whole
   string similarity is dominated by the parts of the name the query does not
   mention. Averaging per term then separates a name containing _every_ term
   from one containing a single common word — measured on the demo catalog,
   0.62 against 0.32 for the same query, where whole-string scoring put them at
   0.53 and 0.44.
3. **`simple` over a stemming dictionary is right-sizing.** A language
   configuration would improve one deployment slightly while making the text
   search config a per-deployment setting threaded through schema, migration and
   query builder — on a platform that has otherwise refused locale machinery.
   Names are nouns and model numbers; prefix matching recovers most of what
   stemming would give ("hammer" finds "hammers") with no locale knowledge.
4. **A generated column beats a trigger or a bare expression index.** The
   database maintains it on every write, so the overlay/sync split (`0022`)
   cannot desynchronize it — a re-sync that changes `name` reindexes by
   construction, with no application code involved.
5. **The indexes are insurance, not necessity.** At several hundred rows a scan
   is imperceptible; the GIN indexes cost a little write time on a catalog
   written in batches a few times a month, and mean nothing is revisited if it
   grows an order of magnitude.
6. **Tokenizing in application code is a security boundary.** `to_tsquery`
   raises on malformed syntax, so passing user input turns a stray `&` into a 500. Building the query from validated tokens makes that unrepresentable and
   gives NFR-SEC-07's bounds one place to live. (`websearch_to_tsquery` is also
   safe but emits no prefix terms, where much of the recall is.)

## Consequences

- (+) One indexed query satisfies both clauses of FR-SEARCH-02; relevance is
  just a column the sort controls (FR-SEARCH-04) can order by.
- (+) No second datastore to deploy, back up (`0017`, `0028`) or keep
  consistent — search is derived from the rows a restore brings back.
- (+) Quality is tunable by changing weights and the threshold in one
  expression, with no reindexing step.
- (−) Those weights are empirical, so they need the api-e2e fixture set (query →
  expected top hit, covering typos, word order, accents, partial words and the
  no-result case) as the executable specification of FR-SEARCH-02.
- (−) No stemming costs recall in a heavily inflecting language. Accepted;
  revisit only if the zero-result panel (NFR-OPS-05) shows it biting.
- (−) Ordering must always close with `name, id`: without a total order, rows of
  equal score can swap between page requests and be duplicated or skipped.
- (⚠) `unaccent(text)` is **STABLE, not IMMUTABLE**, so it cannot appear in a
  generated column or index expression. The migration defines an IMMUTABLE
  `search_unaccent` wrapper pinning the dictionary; every query must spell it
  identically or the expression index goes unused.
- (⚠) The migration creates the `unaccent` and `pg_trgm` extensions — the first
  the schema has needed. Both are trusted (PG13+), so the database owner
  suffices, but the migration role must own the database.
