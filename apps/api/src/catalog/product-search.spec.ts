import { PgDialect } from 'drizzle-orm/pg-core';
import { SEARCH_QUERY_MAX_LENGTH } from '@b2b-catalog-platform/shared';
import {
  adminSearchCondition,
  parseSearchQuery,
  SEARCH_MAX_TERMS,
  searchCondition,
} from './product-search';

/** Renders a condition to SQL text plus its bound parameters. */
function toQuery(condition: ReturnType<typeof searchCondition>) {
  return new PgDialect().sqlToQuery(condition);
}

function fixtureQuery() {
  const query = parseSearchQuery('hafen espresso');
  if (!query) throw new Error('fixture query should parse');
  return query;
}

/** True if the whole expression sits inside one outer paren group, so a caller
 * can AND it with anything without the ORs escaping. */
function isOneGroup(text: string): boolean {
  let depth = 0;
  for (const [i, ch] of [...text].entries()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && i < text.length - 1) return false;
  }
  return depth === 0;
}

/**
 * The parser is the whole security boundary in front of `to_tsquery`:
 * anything it emits is interpolated into a tsquery, so "no operator
 * character survives tokenization" is the property under test. Relevance
 * *ordering* needs real rows and a real Postgres, and is covered by the api-e2e
 * search fixtures.
 */
describe('parseSearchQuery', () => {
  it('splits on punctuation and emits an AND of prefix terms', () => {
    expect(parseSearchQuery('hafen espresso')).toEqual({
      normalized: 'hafen espresso',
      terms: ['hafen', 'espresso'],
      tsquery: 'hafen:* & espresso:*',
    });
  });

  it('lower-cases and collapses separators of every kind', () => {
    expect(parseSearchQuery('  Roastery   No. 7 ')).toEqual({
      normalized: 'roastery no 7',
      terms: ['roastery', 'no', '7'],
      tsquery: 'roastery:* & no:* & 7:*',
    });
  });

  it('keeps accented letters as terms — folding happens in the database', () => {
    // `search_unaccent` folds both sides, so the parser must not drop these
    // characters or the term would no longer match its own row.
    expect(parseSearchQuery('Kaicafé')?.terms).toEqual(['kaicafé']);
  });

  it.each([
    ['tsquery operators', 'a & b | !c'],
    ['prefix stars', 'espresso:***'],
    ['quotes and parens', `foo') OR 1=1 --`],
    ['angle brackets', 'a <-> b'],
  ])('strips %s from the emitted tsquery', (_label, input) => {
    const parsed = parseSearchQuery(input);
    // Every term is bare word characters plus the `:*` this code appends.
    for (const term of parsed?.terms ?? []) {
      expect(term).toMatch(/^[\p{L}\p{N}]+$/u);
    }
    expect(parsed?.tsquery ?? '').toMatch(
      /^([\p{L}\p{N}]+:\*)( & [\p{L}\p{N}]+:\*)*$/u,
    );
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['punctuation only', '!!! ***'],
    ['a single character', 'a'],
  ])('returns null for %s input, so no query is run', (_label, input) => {
    expect(parseSearchQuery(input)).toBeNull();
  });

  it('accepts a two-character query as the shortest runnable one', () => {
    expect(parseSearchQuery('no')?.terms).toEqual(['no']);
  });

  it('caps term count, so a long query cannot fan out into index scans', () => {
    const parsed = parseSearchQuery(
      Array.from({ length: SEARCH_MAX_TERMS + 5 }, (_, i) => `t${i}`).join(' '),
    );
    expect(parsed?.terms).toHaveLength(SEARCH_MAX_TERMS);
  });

  it('truncates before tokenizing, so length is bounded by input not terms', () => {
    const parsed = parseSearchQuery('x'.repeat(SEARCH_QUERY_MAX_LENGTH + 50));
    expect(parsed?.normalized).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
  });
});

describe('searchCondition', () => {
  it('ORs the full-text match with one fuzzy predicate per term', () => {
    const query = parseSearchQuery('hafen espresso');
    if (!query) throw new Error('fixture query should parse');

    const { sql } = new PgDialect().sqlToQuery(searchCondition(query));

    // Both halves are present: one tsvector match, one `%>` per term. Each is
    // separately index-backed, which is what keeps this a bitmap OR.
    expect(sql).toContain('to_tsquery');
    expect(sql.match(/%>/g)).toHaveLength(query.terms.length);
  });

  it.each([
    ['searchCondition', () => searchCondition(fixtureQuery())],
    ['adminSearchCondition', () => adminSearchCondition('hafen espresso')],
  ])('wraps %s in parentheses', (_label, build) => {
    // Not cosmetic: drizzle's `and()` splices a raw fragment in as-is, so an
    // unwrapped `a or b` would bind as `(deletedAt is null and a) or b` and let
    // soft-deleted rows through the caller's filter.
    const condition = build();
    if (!condition) throw new Error('fixture should produce a condition');
    expect(isOneGroup(toQuery(condition).sql)).toBe(true);
  });
});

describe('adminSearchCondition', () => {
  it.each([
    ['empty', ''],
    ['blank', '   '],
  ])('returns null for %s input, leaving the grid unfiltered', (_l, input) => {
    expect(adminSearchCondition(input)).toBeNull();
  });

  it('matches the name or the sync key', () => {
    const condition = adminSearchCondition('hafen');
    if (!condition) throw new Error('fixture should produce a condition');
    const { sql, params } = toQuery(condition);

    expect(sql).toContain('to_tsquery');
    expect(sql).toContain('ilike');
    expect(params).toContain('%hafen%');
  });

  it('still filters on a query too short for the name matcher', () => {
    // One character cannot run the name matcher, but it is a valid key
    // fragment — dropping the filter would show the whole catalog instead.
    const condition = adminSearchCondition('7');
    if (!condition) throw new Error('fixture should produce a condition');
    const { sql, params } = toQuery(condition);

    expect(sql).not.toContain('to_tsquery');
    expect(params).toContain('%7%');
  });

  it('keeps punctuation in the key half, which tokenization would drop', () => {
    const condition = adminSearchCondition('legacy:AB-1200/3');
    if (!condition) throw new Error('fixture should produce a condition');
    expect(toQuery(condition).params).toContain('%legacy:AB-1200/3%');
  });

  it('escapes LIKE metacharacters, so a pasted % is not a wildcard', () => {
    const condition = adminSearchCondition('50%_off\\x');
    if (!condition) throw new Error('fixture should produce a condition');
    expect(toQuery(condition).params).toContain('%50\\%\\_off\\\\x%');
  });
});
