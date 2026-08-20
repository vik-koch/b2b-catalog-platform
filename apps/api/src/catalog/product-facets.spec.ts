import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, SQL } from 'drizzle-orm';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import {
  buildFacets,
  resolveSelections,
  selectionConditions,
} from './product-facets';

const definition = (
  name: string,
  slug: string,
  type: 'text' | 'number' = 'text',
  unit: string | null = null,
) =>
  ({
    id: `id-${slug}`,
    name,
    slug,
    type,
    unit,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: null,
  }) as typeof schema.attributeDefinitions.$inferSelect;

const colour = definition('Colour', 'colour');
const length = definition('Length', 'length', 'number', 'cm');

/** Rendering db: fragments are only ever inspected as SQL, never executed. */
const renderDb = drizzle({ client: {} as never, schema });

const render = (condition: SQL | undefined) =>
  renderDb
    .select({ slug: products.slug })
    .from(products)
    .where(and(condition))
    .toSQL();

/**
 * Drizzle stand-in for `countValues`: every chain ends in `.groupBy(...)` and
 * resolves to the next queued row set, in the order buildFacets asks for them
 * (the value lists, then the counts, then one pass per selected attribute).
 */
function dbReturning(results: unknown[][]) {
  let i = 0;
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(results[i++] ?? []),
  };
  return {
    select: () => chain,
    queries: () => i,
  } as unknown as NodePgDatabase<typeof schema> & { queries(): number };
}

const row = (key: string, value: string, count: number) => ({
  key,
  value,
  count,
});

describe('resolveSelections', () => {
  it('ignores a number attribute value that is not a number', () => {
    expect(
      resolveSelections(
        [
          { slug: 'length', values: ['30', 'ca. 30'] },
          { slug: 'colour', values: ['ca. 30'] },
        ],
        [colour, length],
      ),
    ).toEqual([
      { definition: length, values: ['30'] },
      { definition: colour, values: ['ca. 30'] },
    ]);
  });

  it('maps a URL slug onto the attribute key products carry', () => {
    expect(
      resolveSelections([{ slug: 'colour', values: ['Blue'] }], [colour]),
    ).toEqual([{ definition: colour, values: ['Blue'] }]);
  });

  it('drops a slug nobody declares, so an outdated link still lists', () => {
    expect(
      resolveSelections([{ slug: 'gone', values: ['Blue'] }], [colour]),
    ).toEqual([]);
  });
});

describe('selectionConditions', () => {
  it('matches any of one attribute’s values', () => {
    const [condition] = selectionConditions(renderDb, [
      { definition: colour, values: ['Blue', 'Red'] },
    ]);
    const { sql: text, params } = render(condition);

    expect(text).toContain('exists');
    expect(text).not.toContain('join');
    expect(params).toEqual(['Colour', 'Blue', 'Red']);
  });

  it('yields one condition per attribute, so they must all match', () => {
    expect(
      selectionConditions(renderDb, [
        { definition: colour, values: ['Blue'] },
        { definition: length, values: ['30'] },
      ]),
    ).toHaveLength(2);
  });
});

describe('buildFacets', () => {
  it('runs a single grouped query when nothing is selected', async () => {
    const db = dbReturning([
      [row('Colour', 'Blue', 2), row('Colour', 'Red', 1)],
    ]);

    const facets = await buildFacets(db, undefined, [colour], []);

    expect(db.queries()).toBe(1);
    expect(facets).toEqual([
      {
        slug: 'colour',
        name: 'Colour',
        type: 'text',
        unit: null,
        values: [
          { value: 'Blue', count: 2, selected: false },
          { value: 'Red', count: 1, selected: false },
        ],
      },
    ]);
  });

  it('counts an attribute against the others, not against itself', async () => {
    const db = dbReturning([
      // The values in scope.
      [
        row('Colour', 'Blue', 2),
        row('Colour', 'Red', 1),
        row('Length', '30', 2),
        row('Length', '40', 1),
      ],
      // Every selection applied — what an unselected facet counts.
      [row('Length', '30', 1)],
      // Colour, with the other selections only.
      [row('Colour', 'Blue', 1), row('Colour', 'Red', 1)],
    ]);

    const facets = await buildFacets(
      db,
      undefined,
      [colour, length],
      [{ definition: colour, values: ['Blue'] }],
    );

    // Selecting Blue does not shorten its own list, and Red keeps the count it
    // would have if it were picked instead.
    expect(facets[0].values).toEqual([
      { value: 'Blue', count: 1, selected: true },
      { value: 'Red', count: 1, selected: false },
    ]);
    // The other facet is counted with Blue applied, and a value it leaves
    // empty stays listed, greyed by its zero count.
    expect(facets[1].values).toEqual([
      { value: '30', count: 1, selected: false },
      { value: '40', count: 0, selected: false },
    ]);
  });

  it('orders a number attribute numerically and drops what is not a number', async () => {
    const db = dbReturning([
      [
        row('Length', '100', 1),
        row('Length', 'ca. 30', 1),
        row('Length', '9', 1),
        row('Length', '10', 1),
      ],
    ]);

    const [facet] = await buildFacets(db, undefined, [length], []);

    // "ca. 30" is still stored and still shown on the product page; it just
    // offers no checkbox (FR-ATTR-03).
    expect(facet.values.map((v) => v.value)).toEqual(['9', '10', '100']);
    expect(facet.unit).toBe('cm');
  });

  it('orders a text attribute as text even where its values are numbers', async () => {
    const db = dbReturning([[row('Colour', '10', 1), row('Colour', '9', 1)]]);

    const [facet] = await buildFacets(db, undefined, [colour], []);

    expect(facet.values.map((v) => v.value)).toEqual(['10', '9']);
  });

  it('omits an attribute no product in scope carries', async () => {
    const db = dbReturning([[row('Colour', 'Blue', 1)]]);

    const facets = await buildFacets(db, undefined, [colour, length], []);

    expect(facets.map((f) => f.slug)).toEqual(['colour']);
  });

  it('lists a selected value the scope no longer offers, so it can be cleared', async () => {
    const db = dbReturning([
      [row('Colour', 'Blue', 1)],
      [],
      [row('Colour', 'Blue', 1)],
    ]);

    const [facet] = await buildFacets(
      db,
      undefined,
      [colour],
      [{ definition: colour, values: ['Verdigris'] }],
    );

    expect(facet.values).toContainEqual({
      value: 'Verdigris',
      count: 0,
      selected: true,
    });
  });
});
