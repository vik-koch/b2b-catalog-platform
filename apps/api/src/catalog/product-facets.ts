import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, countDistinct, eq, inArray, ne, SQL } from 'drizzle-orm';
import {
  AttributeSelection,
  Facet,
  FacetValue,
  parseAttributeNumber,
} from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import {
  attributeDefinitions,
  productAttributes,
  products,
} from '../db/schema';
import { attributeValuesCondition } from './attribute-filter';

/**
 * The storefront's facet panel (FR-ATTR-04/05).
 *
 * Two rules decide every query here. The list of values a facet offers comes
 * from the products **in scope** — the category and its subcategories, or the
 * search result set — with no attribute selection applied, so clicking a value
 * never shortens the list it was clicked in. The **count** beside each value is
 * taken with every *other* attribute's selection applied but not its own, which
 * is what makes a greyed zero-count meaningful instead of collapsing every list
 * to what is already selected.
 *
 * Counts obey the publication gate and the soft delete, because they describe
 * what a visitor can reach — the opposite of the admin-side attribute counts,
 * which count the catalog as stored.
 */

/** A definition as the facets need it; the registry row minus its counts. */
type DefinitionRow = typeof attributeDefinitions.$inferSelect;

/** One attribute's selection, resolved from its URL slug to its key. */
export interface ResolvedSelection {
  definition: DefinitionRow;
  values: string[];
}

type Db = NodePgDatabase<typeof schema>;

/** key → value → products carrying it within some scope. */
type Counts = Map<string, Map<string, number>>;

/**
 * Resolves `attr` parameters against the registry. An entry naming an
 * attribute nobody declared is dropped: a filtered link outlives the
 * definition it was written from, and a deleted definition simply stops
 * filtering.
 */
export function resolveSelections(
  selections: AttributeSelection[],
  definitions: DefinitionRow[],
): ResolvedSelection[] {
  const bySlug = new Map(definitions.map((row) => [row.slug, row]));
  return selections.flatMap(({ slug, values }) => {
    const definition = bySlug.get(slug);
    if (!definition) return [];
    const filterable = values.filter((value) =>
      isFilterable(definition, value),
    );
    return filterable.length > 0 ? [{ definition, values: filterable }] : [];
  });
}

/**
 * Whether a value can appear in its attribute's filter at all. A number
 * attribute filters by numbers: a value that does not read as one is still
 * stored and still shown on the product page, but it offers no checkbox
 * (FR-ATTR-03) — and is dropped from a selection too, so the list and the
 * predicate never disagree.
 */
function isFilterable(definition: DefinitionRow, value: string): boolean {
  return definition.type !== 'number' || parseAttributeNumber(value) !== null;
}

/** The `where` fragments a selection adds to a listing — AND across attributes. */
export function selectionConditions(
  db: Db,
  selections: ResolvedSelection[],
): SQL[] {
  return selections.flatMap(({ definition, values }) => {
    const condition = attributeValuesCondition(db, definition.name, values);
    return condition ? [condition] : [];
  });
}

/**
 * Product counts per attribute value over a scope, in one grouped pass.
 *
 * `count(distinct productId)`, not rows: a product may carry the same key twice
 * (the grid is a list of lines, not a map), and it is still one product. Rows
 * with no value are skipped — a product saved before valueless attributes
 * stopped being stored must not become a nameless checkbox.
 */
async function countValues(
  db: Db,
  scope: SQL | undefined,
  keys: string[],
): Promise<Counts> {
  if (keys.length === 0) return new Map();

  const rows = await db
    .select({
      key: productAttributes.key,
      value: productAttributes.value,
      count: countDistinct(products.id),
    })
    .from(productAttributes)
    .innerJoin(products, eq(products.id, productAttributes.productId))
    .where(
      and(
        scope,
        inArray(productAttributes.key, keys),
        ne(productAttributes.value, ''),
      ),
    )
    .groupBy(productAttributes.key, productAttributes.value);

  const counts: Counts = new Map();
  for (const row of rows) {
    const values = counts.get(row.key) ?? new Map<string, number>();
    values.set(row.value, Number(row.count));
    counts.set(row.key, values);
  }
  return counts;
}

/**
 * Values by their numeric form, so a list of sizes reads 9, 10, 100 rather than
 * 10, 100, 9. A text attribute is sorted as text even where its values happen
 * to be numbers: the definition says how they are read.
 */
function sortValues(values: FacetValue[], type: DefinitionRow['type']) {
  const numeric = new Map(
    values.map((entry) => [
      entry.value,
      type === 'number' ? parseAttributeNumber(entry.value) : null,
    ]),
  );
  return [...values].sort((a, b) => {
    const left = numeric.get(a.value) ?? null;
    const right = numeric.get(b.value) ?? null;
    if (left !== null && right !== null && left !== right) return left - right;
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  });
}

/**
 * The facet panel for one listing. `scope` is the listing's `where` **without**
 * any attribute selection — the selection is applied here, per facet, so each
 * one is counted against the others.
 *
 * Costs one query for the value lists, one for the counts, and one more per
 * *selected* attribute: every unselected facet shares the same "all selections
 * applied" count, so an unfiltered listing runs a single grouped query.
 */
export async function buildFacets(
  db: Db,
  scope: SQL | undefined,
  definitions: DefinitionRow[],
  selections: ResolvedSelection[],
): Promise<Facet[]> {
  if (definitions.length === 0) return [];

  const keys = definitions.map((row) => row.name);
  const universe = await countValues(db, scope, keys);
  const selected = new Map(
    selections.map(({ definition, values }) => [
      definition.name,
      new Set(values),
    ]),
  );

  const conditions = selectionConditions(db, selections);
  const filtered =
    conditions.length === 0
      ? universe
      : await countValues(db, and(scope, ...conditions), keys);

  // One extra pass per selected attribute: its own values are counted with the
  // other attributes' selections only.
  const own = new Map<string, Counts>();
  for (const { definition } of selections) {
    const others = selectionConditions(
      db,
      selections.filter((entry) => entry.definition.name !== definition.name),
    );
    own.set(
      definition.name,
      await countValues(db, and(scope, ...others), [definition.name]),
    );
  }

  return definitions.flatMap((definition) => {
    const inScope = universe.get(definition.name) ?? new Map();
    const chosen = selected.get(definition.name) ?? new Set<string>();
    const counts =
      own.get(definition.name)?.get(definition.name) ??
      filtered.get(definition.name) ??
      new Map<string, number>();

    // A selected value the scope no longer offers is still listed, or a shared
    // link would filter by something the panel cannot show or clear.
    const values = [...new Set([...inScope.keys(), ...chosen])]
      .filter((value) => isFilterable(definition, value))
      .map((value): FacetValue => ({
        value,
        count: counts.get(value) ?? 0,
        selected: chosen.has(value),
      }));
    if (values.length === 0) return [];

    return [
      {
        slug: definition.slug,
        name: definition.name,
        type: definition.type,
        unit: definition.unit,
        values: sortValues(values, definition.type),
      },
    ];
  });
}
