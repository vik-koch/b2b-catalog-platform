import { productSeeds } from '@b2b-catalog-platform/seed';
import {
  CATALOG_PAGE_SIZE,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_SUGGESTION_LIMIT,
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
      'availability',
      'images',
      'lineNoteEnabled',
      'lineNotePrompt',
      'name',
      'packaging',
      'priceMinor',
      'prices',
      'slug',
    ]);
    expect(JSON.stringify(res.data)).not.toContain('priceBasisPieces');
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
    //
    // Sequential, and seeded rows only: another suite creating a matching
    // product between the two requests would shift rows across the page
    // boundary, which is a different (and expected) effect entirely.
    const first = await search('espresso', 1);
    const second = await search('espresso', 2);

    const seeded = new Set(productSeeds.map((p) => p.slug));
    const slugs = [...first.data.items, ...second.data.items]
      .map((i: { slug: string }) => i.slug)
      .filter((slug: string) => seeded.has(slug));
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

  /**
   * FR-SEARCH-04 on search. The point of these is that a sort reorders the
   * matches without changing which rows matched — a price-sorted search is
   * still a search, not a listing.
   */
  describe('sort controls (FR-SEARCH-04)', () => {
    // Over-matching on purpose, so there is more than one row to order.
    const many = 'espresso kontor reserve';
    const sorted = (sort: string, q = many) =>
      get(`/catalog/search?q=${encodeURIComponent(q)}&sort=${sort}`);

    /**
     * Only the seeded products, in the order the response gave them.
     *
     * The suites share one database and run in parallel, and this query
     * deliberately over-matches: the admin-catalog suite creates products named
     * "Grid Espresso Roast …" and the sync suite creates "Sync Beans Reserve",
     * both of which match it and both of which come and go while these
     * assertions run. Comparing raw result lists therefore compares two
     * different moments of the catalog. Restricting to the seeded rows — the
     * only ones this suite owns — tests the ordering rule without depending on
     * what else exists.
     */
    const seededSlugs = (res: { data: { items: { slug: string }[] } }) => {
      const seeded = new Set(productSeeds.map((p) => p.slug));
      return res.data.items.map((i) => i.slug).filter((s) => seeded.has(s));
    };

    it('defaults to relevance', async () => {
      // Sequential, not concurrent: two requests in flight at once can straddle
      // another suite's write, which shifts what lands on page one.
      const implicit = await search(many);
      const explicit = await sorted('relevance');

      expect(seededSlugs(explicit)).toEqual(seededSlugs(implicit));
      expect(seededSlugs(explicit).length).toBeGreaterThan(1);
    });

    it.each([
      ['price', (a: number, b: number) => a - b],
      ['price_desc', (a: number, b: number) => b - a],
    ])('orders the matches by %s', async (sort, compare) => {
      const res = await sorted(sort);

      const prices = res.data.items.map(
        (i: { priceMinor: number }) => i.priceMinor,
      );
      expect(res.status).toBe(200);
      expect(prices).toEqual([...prices].sort(compare));
    });

    it('changes the order but not the matched set', async () => {
      const byRelevance = await sorted('relevance');
      const byPrice = await sorted('price');

      // The seeded rows are the ones this suite owns; the totals themselves
      // move as other suites create and remove matching products.
      expect(new Set(seededSlugs(byPrice))).toEqual(
        new Set(seededSlugs(byRelevance)),
      );
      expect(seededSlugs(byPrice).length).toBeGreaterThan(1);
    });

    it('reverses the result set on name_desc', async () => {
      // A narrow query on purpose: within a single page the two directions are
      // exact mirrors, which says more than re-sorting the names in JS (whose
      // collation does not agree with the database's on the seed names).
      const ascending = await sorted('name', 'kontor');
      const descending = await sorted('name_desc', 'kontor');

      expect(ascending.data.pagination.totalPages).toBe(1);
      expect(seededSlugs(descending)).toEqual(
        [...seededSlugs(ascending)].reverse(),
      );
    });

    it('rejects an unknown sort key at the contract', async () => {
      expect((await sorted('cheapest')).status).toBe(400);
    });
  });

  it('cannot be steered by tsquery syntax in the input', async () => {
    // Operator characters are stripped in tokenization, so this is searched
    // for as the words it contains rather than parsed — and never 500s.
    const res = await search("espresso:*') | !x <-> y");

    expect(res.status).toBe(200);
  });
});

/**
 * FR-SEARCH-05. The suggestion list is a second consumer of the same matcher,
 * so what is worth testing here is not recall again — that is covered above —
 * but the two properties that make it a *suggestion* list: it never shows more
 * than a glance's worth, and it agrees with the page submitting would produce.
 * A dropdown that disagreed with its own result page would be worse than none.
 */
describe('GET /catalog/search/suggestions (FR-SEARCH-05)', () => {
  const suggest = (q: string) =>
    get(`/catalog/search/suggestions?q=${encodeURIComponent(q)}`);

  it('offers names and slugs only', async () => {
    const res = await suggest('Hafen Espresso');

    expect(res.status).toBe(200);
    expect(res.data.items[0]).toEqual({
      slug: slugOf('Hafen Espresso'),
      name: 'Hafen Espresso',
    });
  });

  // Several words on purpose: candidates are an OR across terms, so a query
  // like this over-matches by design and is the seed catalog's way of
  // producing more matches than the cap. No single seeded word does — the
  // demo names are too varied — and a cap only proves itself against a
  // result set larger than the cap.
  const overMatching = 'espresso kontor reserve';

  it('caps the list even when far more products match', async () => {
    const suggestions = await suggest(overMatching);
    const results = await search(overMatching);

    expect(results.data.pagination.total).toBeGreaterThan(
      SEARCH_SUGGESTION_LIMIT,
    );
    expect(suggestions.data.items).toHaveLength(SEARCH_SUGGESTION_LIMIT);
  });

  it('is the leading slice of the result page, in the same order', async () => {
    // Sequential: this compares two responses row for row, so a product another
    // suite creates between them would show up as a ranking bug that is not one.
    const suggestions = await suggest(overMatching);
    const results = await search(overMatching);

    expect(suggestions.data.items.map((i: { slug: string }) => i.slug)).toEqual(
      results.data.items
        .slice(0, SEARCH_SUGGESTION_LIMIT)
        .map((i: { slug: string }) => i.slug),
    );
  });

  it('tolerates typos like the full search does', async () => {
    const res = await suggest('hafn espreso');

    expect(res.data.items[0]?.slug).toBe(slugOf('Hafen Espresso'));
  });

  it.each([
    ['a query matching nothing', 'zzzzqqq'],
    ['a single character', 'a'],
    ['no query at all', ''],
  ])('answers %s with an empty list, not an error', async (_label, query) => {
    const res = await suggest(query);

    expect(res.status).toBe(200);
    expect(res.data.items).toEqual([]);
  });

  it('rejects an over-long query at the contract (NFR-SEC-07)', async () => {
    const res = await suggest('x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1));

    expect(res.status).toBe(400);
  });
});
