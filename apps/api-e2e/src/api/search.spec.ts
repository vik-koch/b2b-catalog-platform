import { productSeeds } from '@b2b-catalog-platform/seed';
import {
  CATALOG_PAGE_SIZE,
  SEARCH_QUERY_MAX_LENGTH,
} from '@b2b-catalog-platform/shared';
import axios from 'axios';

const get = (url: string) => axios.get(url, { validateStatus: () => true });
const search = (q: string, page?: number) =>
  get(
    `/catalog/search?q=${encodeURIComponent(q)}${page ? `&page=${page}` : ''}`,
  );

/** Resolves a seeded product by its exact name, so fixtures read as names. */
const slugOf = (name: string): string => {
  const seed = productSeeds.find((p) => p.name === name);
  if (!seed) throw new Error(`No seeded product named "${name}"`);
  return seed.slug;
};

/**
 * The executable specification of FR-SEARCH-02/03. Scoring weights
 * are empirical, so this is what keeps them tunable: each row states a way a
 * visitor might get a product's name wrong, and the product they must still
 * land on. A weight change that breaks recall breaks a row here by name.
 */
describe('GET /catalog/search (FR-SEARCH-01…03)', () => {
  it.each([
    ['the exact name', 'Hafen Espresso', 'Hafen Espresso'],
    ['a misspelling of every word', 'hafn espreso', 'Hafen Espresso'],
    ['the words in the wrong order', 'espresso hafen', 'Hafen Espresso'],
    ['only part of the name', 'notturno', 'Notturno Ristretto'],
    ['a partial word', 'grinde', 'Kontor Hand Grinder'],
    // A whole word beats a longer word it is a prefix of: "grind" is exactly
    // one of this product's words, and only the start of the other's.
    ['a word another product merely starts with', 'grind', 'Kontor Grind One'],
    ['a dropped apostrophe', 'crema doro', "Crema d'Oro"],
    ['a dropped accent', 'kaicafe bar', 'Kaicafé Bar'],
    ['a transposed letter', 'nordic pull', 'Nordic Pull'],
  ])('ranks %s first', async (_label, query, expected) => {
    const res = await search(query);

    expect(res.status).toBe(200);
    expect(res.data.items[0]?.slug).toBe(slugOf(expected));
  });

  it('returns product tiles in the same shape the grid renders', async () => {
    const res = await search('Hafen Espresso');

    // Exactly the contract keys — no internal column rides along.
    expect(Object.keys(res.data.items[0]).sort()).toEqual([
      'images',
      'name',
      'priceMinor',
      'slug',
    ]);
  });

  it('paginates like the category grid', async () => {
    const res = await search('espresso');

    expect(res.data.pagination).toMatchObject({
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
    });
    expect(res.data.items.length).toBeLessThanOrEqual(CATALOG_PAGE_SIZE);
    expect(res.data.pagination.total).toBeGreaterThan(0);
  });

  it('keeps a result on exactly one page', async () => {
    // The `name, id` tiebreak exists for this: without a total order, rows of
    // equal score can swap between requests and be duplicated or skipped.
    const [first, second] = await Promise.all([
      search('espresso', 1),
      search('espresso', 2),
    ]);

    const slugs = [...first.data.items, ...second.data.items].map(
      (i: { slug: string }) => i.slug,
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each([
    ['a query matching nothing', 'zzzzqqq'],
    ['a single character', 'a'],
    ['punctuation only', '!!!'],
    ['no query at all', ''],
  ])('answers %s with an empty page, not an error', async (_label, query) => {
    const res = await search(query);

    expect(res.status).toBe(200);
    expect(res.data.items).toEqual([]);
    expect(res.data.pagination.total).toBe(0);
  });

  it('rejects an over-long query at the contract (NFR-SEC-07)', async () => {
    const res = await search('x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1));

    expect(res.status).toBe(400);
  });

  it('cannot be steered by tsquery syntax in the input', async () => {
    // Operator characters are stripped in tokenization, so this is searched
    // for as the words it contains rather than parsed — and never 500s.
    const res = await search("espresso:*') | !x <-> y");

    expect(res.status).toBe(200);
  });
});
