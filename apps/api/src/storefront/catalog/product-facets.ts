/**
 * The storefront's facet panel (FR-ATTR-04/05). A facet's values come from the
 * products in scope with no selection applied, so clicking a value never
 * shortens its own list. Each count applies every other attribute's selection
 * but not its own, so a greyed zero means something.
 */

import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, countDistinct, eq, inArray, ne, SQL } from 'drizzle-orm';
import {
  AttributeSelection,
  parseAttributeNumber,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  Facet,
  FacetValue,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import * as schema from '../../db/schema';
import { productAttributes, products } from '../../db/schema';
import { attributeValuesCondition } from '../../core/catalog/attribute-filter';
import { DefinitionRow } from '../../core/catalog/category-filters';

/** One attribute's selection, resolved from its URL slug to its key. */
export interface ResolvedSelection {
  definition: DefinitionRow;
  values: string[];
}

type Db = NodePgDatabase<typeof schema>;

/** key → value → products carrying it within some scope. */
type Counts = Map<string, Map<string, number>>;

/** `attr` parameters resolved against the registry. An undeclared attribute is
 * dropped: a link outlives the definition it was written from. */
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

/** Whether a value can be filtered by at all: a number attribute's
 * non-numeric value offers no checkbox (FR-ATTR-03) and is dropped from a
 * selection too, so list and predicate agree. */
function isFilterable(definition: DefinitionRow, value: string): boolean {
  return definition.type !== 'number' || parseAttributeNumber(value) !== null;
}

/** The `where` fragments a selection adds, ANDed across attributes. */
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
 * Products per attribute value over a scope, in one grouped pass. Distinct
 * products, since one may carry a key twice; rows without a value are skipped,
 * or older rows would become nameless checkboxes.
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

/** A number attribute's values in numeric order (9, 10, 100); a text one's
 * as text, whatever they look like. */
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
 * The facet panel for one listing. `scope` excludes the selection, which is
 * applied here per facet. One query for the values, one for the counts, one
 * per selected attribute: an unfiltered listing runs a single grouped query.
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
