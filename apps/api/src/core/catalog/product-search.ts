/**
 * Name matching for every product and category search, so "matches this name"
 * has one definition. Full-text search gives word-order independence and
 * prefixes, trigram word similarity gives typo tolerance; candidates are an OR
 * of both, each half indexable, ordered by a combined score.
 */

import { SQL, sql } from 'drizzle-orm';
import {
  alternateLayoutQuery,
  KeyboardLayout,
} from '@b2b-catalog-platform/shared/platform';
import {
  SEARCH_QUERY_MAX_LENGTH,
  searchTerms,
} from '@b2b-catalog-platform/shared/core/catalog';
import { products } from '../../db/schema';

/** Terms past this add only planner work: every term is another index scan. */
export const SEARCH_MAX_TERMS = 8;

/** Below this a query matches most of the catalog, so it is not run at all. */
const SEARCH_MIN_LENGTH = 2;

/**
 * How close a term must come to a word of the name to count as a typo. Real
 * typos in the demo catalog ("esspreso", "hafn") land at 0.6–0.78 and unrelated
 * input at 0, so 0.5 keeps a margin below the floor.
 */
const SEARCH_WORD_SIMILARITY_THRESHOLD = 0.5;

/**
 * One word of the query: its terms as typed and, where the second keyboard
 * layout reads it differently (FR-SEARCH-08), on that layout. Punctuation
 * inside a word splits it into several terms; either list may be empty.
 */
export interface SearchWord {
  typed: string[];
  other: string[];
}

/** A query that survived parsing and is worth running. */
export interface SearchQuery {
  /** Typed terms joined by a space: what the substring tiers compare. */
  normalized: string;
  /** The same, every word on the other layout; absent where none reads differently. */
  otherNormalized?: string;
  terms: string[];
  words: SearchWord[];
  /** Per word, its prefix terms in either reading; every word required. */
  tsquery: string;
}

/**
 * How much less a match on the other layout counts, so that at an equal fit
 * the query as typed ranks first: off the tier, and off the similarity.
 */
const OTHER_TIER_PENALTY = 0.5;
const OTHER_SIMILARITY_WEIGHT = 0.9;

/**
 * Raw input as a query safe to run, or null when nothing is worth searching
 * for. `searchTerms` lets no operator character through, so the `tsquery`
 * needs no escaping. Each word is read on the second layout separately, so a
 * query typed half on each matches like one typed right.
 */
export function parseSearchQuery(
  input: string,
  layout?: KeyboardLayout | null,
): SearchQuery | null {
  const raw = input.slice(0, SEARCH_QUERY_MAX_LENGTH);
  // Whitespace is never mapped, so the two split into the same words.
  const otherChunks = alternateLayoutQuery(raw, layout)?.split(/\s+/u) ?? [];
  const words: SearchWord[] = [];
  let budget = SEARCH_MAX_TERMS;
  raw.split(/\s+/u).forEach((chunk, i) => {
    if (budget <= 0) return;
    const typed = searchTerms(chunk).slice(0, budget);
    const mapped = searchTerms(otherChunks[i] ?? '').slice(0, budget);
    const other = mapped.join(' ') === typed.join(' ') ? [] : mapped;
    if (!typed.length && !other.length) return;
    words.push({ typed, other });
    budget -= Math.max(typed.length, other.length);
  });

  const terms = words.flatMap((word) => word.typed);
  const normalized = terms.join(' ');
  const otherNormalized = words.some((word) => word.other.length)
    ? words
        .flatMap((word) => (word.other.length ? word.other : word.typed))
        .join(' ')
    : undefined;
  const longest = Math.max(normalized.length, otherNormalized?.length ?? 0);
  if (longest < SEARCH_MIN_LENGTH) return null;

  return {
    normalized,
    ...(otherNormalized === undefined ? {} : { otherNormalized }),
    terms,
    words,
    tsquery: words.map(wordTsquery).join(' & '),
  };
}

/** A word's readings: one, or two where the other layout differs. */
function readings(word: SearchWord): string[][] {
  return [word.typed, word.other].filter((terms) => terms.length > 0);
}

function wordTsquery(word: SearchWord): string {
  const each = readings(word).map((terms) =>
    terms.map((term) => `${term}:*`).join(' & '),
  );
  return each.length === 1
    ? each[0]
    : `(${each.map((reading) => `(${reading})`).join(' | ')})`;
}

/** A name as both halves of the matcher see it: unaccented, lower-cased. */
const folded = (name: SQL | typeof products.name) =>
  sql`lower(search_unaccent(${name}))`;

/** Whether `tsv` holds every term of the query, each as a word prefix. */
const fullText = (tsv: SQL | typeof products.nameTsv, tsquery: string) =>
  sql`(${tsv} @@ to_tsquery('simple', search_unaccent(${tsquery})))`;

/** Which products are candidates. Every branch is index-backed, so this
 * stays a bitmap OR of index scans rather than a table scan. */
export function searchCondition(query: SearchQuery): SQL {
  const terms = new Set(query.words.flatMap(readings).flat());
  const fuzzy = [...terms].map(
    (term) => sql`search_unaccent(${products.name}) %> ${term}`,
  );
  return or([fullText(products.nameTsv, query.tsquery), ...fuzzy]);
}

/**
 * Whether a category's name answers the query (FR-SEARCH-07). Stricter than
 * for products: every word has to match. A product sharing one word sinks in a
 * ranked list, but a category offered beside them claims the query names it,
 * and "hafen espresso" does not name *Espresso*. Unindexed: the table is small.
 */
export function categoryNameCondition(query: SearchQuery, name: SQL): SQL {
  const tsv = sql`to_tsvector('simple', search_unaccent(${name}))`;
  const term = (t: string) =>
    sql`(${fullText(tsv, `${t}:*`)} or search_unaccent(${name}) %> ${t})`;
  const every = (parts: SQL[]) => sql`(${sql.join(parts, sql` and `)})`;
  return every(
    query.words.map((word) =>
      or(readings(word).map((terms) => every(terms.map(term)))),
    ),
  );
}

/** `relevanceScore` for a category name, as matched above. */
export function categoryNameScore(query: SearchQuery, name: SQL): SQL<number> {
  return nameScore(
    query,
    name,
    sql`to_tsvector('simple', search_unaccent(${name}))`,
  );
}

/**
 * The predicates ORed in parentheses. drizzle's `and()` splices a raw fragment
 * in as-is, so an unwrapped `a or b` beside a filter would bind as
 * `(filter and a) or b` and let unfiltered rows through.
 */
function or(conditions: SQL[]): SQL {
  return sql`(${sql.join(conditions, sql` or `)})`;
}

/**
 * How well a product matches, highest first. Tiers the fuzzy tail cannot
 * reorder: a name starting with the query, then containing it, then matching
 * term-wise. A per-term similarity average orders rows within a tier, which is
 * what separates a name with every term from one sharing a common word.
 */
export function relevanceScore(query: SearchQuery): SQL<number> {
  return nameScore(query, products.name, products.nameTsv);
}

function nameScore(
  query: SearchQuery,
  name: SQL | typeof products.name,
  tsv: SQL | typeof products.nameTsv,
): SQL<number> {
  const foldedName = folded(name);
  const tier = (text: string) => sql`(case
      when ${foldedName} like ${text + '%'} then 3
      when position(${text} in ${foldedName}) > 0 then 2
      else 0
    end)`;
  // An empty typed reading — all punctuation — would `like '%'` every row.
  const tiers = [
    ...(query.normalized ? [tier(query.normalized)] : []),
    ...(query.otherNormalized === undefined
      ? []
      : [
          sql`${tier(query.otherNormalized)} - ${sql.raw(String(OTHER_TIER_PENALTY))}`,
        ]),
  ];
  const bestTier =
    tiers.length === 1 ? tiers[0] : sql`greatest(${sql.join(tiers, sql`, `)})`;

  const mean = (terms: string[]) =>
    sql`(${sql.join(
      terms.map((term) => sql`word_similarity(${term}, ${foldedName})`),
      sql` + `,
    )}) / ${terms.length}`;
  // Weighted by typed terms, so a query without a second reading scores
  // exactly as a plain per-term average.
  const weight = (word: SearchWord) => Math.max(word.typed.length, 1);
  const perWord = query.words.map((word) => {
    const typed = word.typed.length ? [mean(word.typed)] : [];
    const other = word.other.length
      ? [sql`${sql.raw(String(OTHER_SIMILARITY_WEIGHT))} * ${mean(word.other)}`]
      : [];
    const best = [...typed, ...other];
    const score =
      best.length === 1 ? best[0] : sql`greatest(${sql.join(best, sql`, `)})`;
    return sql`${sql.raw(String(weight(word)))} * ${score}`;
  });
  const totalWeight = query.words.reduce((sum, word) => sum + weight(word), 0);

  return sql<number>`
    ${bestTier}
    + (case when ${fullText(tsv, query.tsquery)} then 1 else 0 end)
    + (${sql.join(perWord, sql` + `)}) / ${totalWeight}
  `;
}

/**
 * The sync key as a case-insensitive substring of the raw input: a key like
 * `legacy:AB-1200/3` is punctuation tokenization would drop. LIKE
 * metacharacters are escaped, so a pasted `%` is no wildcard scan.
 */
function sourceIdCondition(raw: string): SQL {
  const escaped = raw.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return sql`${products.sourceId} ilike ${'%' + escaped + '%'}`;
}

/**
 * The admin grid's box (FR-ADM-05): the name or the sync key. Null when blank;
 * one character still filters, as a key fragment too short for the name
 * matcher.
 */
export function adminSearchCondition(
  raw: string,
  layout?: KeyboardLayout | null,
): SQL | null {
  if (!raw.trim()) return null;
  const query = parseSearchQuery(raw, layout);
  const byName = query ? [searchCondition(query)] : [];
  const mapped = alternateLayoutQuery(raw, layout);
  const byKey = [raw, ...(mapped === null ? [] : [mapped])].map(
    sourceIdCondition,
  );
  return or([...byName, ...byKey]);
}

/**
 * Pins the trigram threshold for the transaction: `%>` reads it from a setting
 * whose server default would make recall depend on the deployment. `SET LOCAL`
 * keeps it from leaking into the next borrower of a pooled connection.
 */
export const setSearchThreshold = sql`set local pg_trgm.word_similarity_threshold = ${sql.raw(
  String(SEARCH_WORD_SIMILARITY_THRESHOLD),
)}`;
