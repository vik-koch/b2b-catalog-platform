import { SQL, sql } from 'drizzle-orm';
import {
  SEARCH_QUERY_MAX_LENGTH,
  searchTerms,
} from '@b2b-catalog-platform/shared';
import { products } from '../db/schema';

/**
 * Product name matching  — shared by the storefront search and the admin
 * grid's find-a-product box, so "matches this name" has one definition.
 *
 * Two mechanisms:
 * - full-text search gives word-order independence and prefix;
 * - trigram word-similarity gives typo tolerance.
 *
 * Candidates are selected by an OR of both (each half indexable),
 * then ordered by a combined score.
 */

/** Terms past this add nothing but planner work — every term is another index scan. */
export const SEARCH_MAX_TERMS = 8;

/** Below this a query matches most of the catalog, so it is not run at all. */
export const SEARCH_MIN_LENGTH = 2;

/**
 * How close a term must come to some word of the name to count as a typo
 * rather than a different word. Measured against the demo catalog: real typos
 * ("esspreso", "hafn", "nordik") land at 0.6–0.78 and unrelated input at 0, so
 * 0.5 keeps a margin below the observed floor without letting noise in.
 * Applied per-statement, never left to the server default.
 */
export const SEARCH_WORD_SIMILARITY_THRESHOLD = 0.5;

/** A query that survived parsing and is worth running. */
export interface SearchQuery {
  /** Terms joined by a single space — what the substring tiers compare against. */
  normalized: string;
  terms: string[];
  /** An AND of prefix terms, unaccented database-side before parsing. */
  tsquery: string;
}

/**
 * Normalizes raw user input into something safe to run, or null when there is
 * nothing worth searching for (empty, punctuation only, or below the minimum
 * length). Tokenization is `searchTerms` — shared with the search bar's
 * highlighter so both split a query the same way — and it is what makes the
 * result safe to interpolate into a `tsquery`: no operator character survives
 * it, so the caller never needs to escape. Accents are folded in the database
 * (`search_unaccent`), so both sides of the comparison fold identically and
 * this stays a pure string function.
 */
export function parseSearchQuery(input: string): SearchQuery | null {
  const terms = searchTerms(input.slice(0, SEARCH_QUERY_MAX_LENGTH)).slice(
    0,
    SEARCH_MAX_TERMS,
  );

  const normalized = terms.join(' ');
  if (normalized.length < SEARCH_MIN_LENGTH) return null;

  return {
    normalized,
    terms,
    tsquery: terms.map((term) => `${term}:*`).join(' & '),
  };
}

/** The product name as both indexes see it: unaccented, lower-cased. */
const foldedName = sql`lower(search_unaccent(${products.name}))`;

/**
 * Which rows are candidates. Every branch is index-backed — the tsvector GIN
 * for the full-text half, the trigram GIN once per term for the fuzzy half —
 * so this stays a bitmap OR of index scans rather than a table scan.
 */
export function searchCondition(query: SearchQuery): SQL {
  const fuzzy = query.terms.map(
    (term) => sql`search_unaccent(${products.name}) %> ${term}`,
  );
  return or([
    sql`(${products.nameTsv} @@ to_tsquery('simple', search_unaccent(${query.tsquery})))`,
    ...fuzzy,
  ]);
}

/**
 * ORs a list of predicates into one *parenthesized* condition. The parentheses
 * are the point: drizzle's `and()` splices a raw `SQL` fragment in as-is, so an
 * unwrapped `a or b` next to a `deletedAt is null` filter would bind as
 * `(filter and a) or b` and let unfiltered rows through.
 */
function or(conditions: SQL[]): SQL {
  return sql`(${sql.join(conditions, sql` or `)})`;
}

/**
 * How well a row matches, highest first. Three tiers that cannot be reordered
 * by the fuzzy tail: a name starting with the query beats a name merely
 * containing it, which beats one that only matches term-wise. The similarity
 * average is added on top to order rows within a tier — averaging per term
 * rather than scoring the query as one string is what separates a name
 * containing every term from one containing a single common word.
 */
export function relevanceScore(query: SearchQuery): SQL<number> {
  const perTerm = sql.join(
    query.terms.map((term) => sql`word_similarity(${term}, ${foldedName})`),
    sql` + `,
  );

  return sql<number>`
    (case
      when ${foldedName} like ${query.normalized + '%'} then 3
      when position(${query.normalized} in ${foldedName}) > 0 then 2
      else 0
    end)
    + (case when ${products.nameTsv} @@ to_tsquery('simple', search_unaccent(${query.tsquery})) then 1 else 0 end)
    + (${perTerm}) / ${query.terms.length}
  `;
}

/**
 * The admin grid's box also matches the private sync key (FR-ADM-05), as a
 * case-insensitive substring of the raw input rather than through the name
 * matcher: a key like `legacy:AB-1200/3` is punctuation, which tokenization
 * would throw away, and an admin holding a key wants that exact row, not
 * something spelled similarly. LIKE metacharacters are escaped so a pasted `%`
 * cannot turn into a wildcard scan.
 */
export function sourceIdCondition(raw: string): SQL {
  const escaped = raw.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return sql`${products.sourceId} ilike ${'%' + escaped + '%'}`;
}

/**
 * What the admin grid's single search box matches: the product name (same
 * matcher as the storefront, so "matches this name" has one definition) or the
 * sync key. Returns null when the input is blank — an unfiltered grid — but a
 * one-character entry still filters, because it is a valid key fragment even
 * though it is too short to run the name matcher on.
 */
export function adminSearchCondition(raw: string): SQL | null {
  if (!raw.trim()) return null;
  const query = parseSearchQuery(raw);
  const byName = query ? [searchCondition(query)] : [];
  return or([...byName, sourceIdCondition(raw)]);
}

/**
 * Pins the trigram threshold for the current transaction. `%>` reads it from a
 * GUC, and leaving that to the server default would make recall depend on
 * deployment configuration; `SET LOCAL` keeps it per-statement rather than
 * leaking into the next borrower of a pooled connection.
 */
export const setSearchThreshold = sql`set local pg_trgm.word_similarity_threshold = ${sql.raw(
  String(SEARCH_WORD_SIMILARITY_THRESHOLD),
)}`;
