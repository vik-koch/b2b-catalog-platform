import { PgDialect } from 'drizzle-orm/pg-core';
import { SEARCH_QUERY_MAX_LENGTH } from '@b2b-catalog-platform/shared';
import {
  parseSearchQuery,
  SEARCH_MAX_TERMS,
  searchCondition,
} from './product-search';

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
});
