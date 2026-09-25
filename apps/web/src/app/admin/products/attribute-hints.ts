import {
  AttributeDefinition,
  AttributeKeyUsage,
  AttributeType,
  parseAttributeNumber,
  ProductAttribute,
  splitAttributeKey,
  strayPart,
} from '@b2b-catalog-platform/shared';

/**
 * What the catalog already knows about one attribute name, as the product
 * editor needs it: how many products carry it, and whether the shop filters by
 * it.
 *
 * Two sources, because neither covers the other: the inventory lists the names
 * products actually carry (freetext included, which is most of them), the
 * registry lists the names declared filterable — and a definition added before
 * the first product carrying it exists in one list and not the other.
 */
export interface AttributeHint {
  key: string;
  productCount: number;
  /** The definition matching this name exactly, if the shop declared one. */
  type: AttributeType | null;
  unit: string | null;
}

/**
 * Hints by attribute name, alphabetical — the inventory's own order.
 *
 * `ownKeys` are the keys the edited product carried when it was loaded, and
 * they are discounted from the counts: every number here answers "what does the
 * *rest* of the catalog do", which is the only question the editor can help
 * with. Without it a name would stop being reported as unmatched the moment it
 * was saved — the typo would go quiet exactly when it became permanent.
 */
export function attributeHints(
  keys: readonly AttributeKeyUsage[],
  definitions: readonly AttributeDefinition[],
  ownKeys: readonly string[] = [],
): AttributeHint[] {
  const own = new Set(ownKeys.map((key) => key.trim()));
  const hints = new Map<string, AttributeHint>(
    keys.map((entry) => [
      entry.key,
      {
        key: entry.key,
        // At most one, however many rows this product spends on the key: the
        // inventory counts products, not attribute rows.
        productCount: entry.productCount - (own.has(entry.key) ? 1 : 0),
        type: null,
        unit: null,
      },
    ]),
  );
  for (const definition of definitions) {
    const existing = hints.get(definition.name);
    hints.set(definition.name, {
      key: definition.name,
      productCount: existing?.productCount ?? 0,
      type: definition.type,
      unit: definition.unit,
    });
  }
  return [...hints.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * What the grid says about a row's key. Only the cases worth an
 * icon are named: a freetext key other products already carry is the normal
 * case and gets nothing.
 *
 * `unknown` is the one the batch exists for — a key nothing else in the
 * catalog carries is either a new attribute or a typo, and the typo is only
 * cheap to fix while it is still being typed.
 */
export type AttributeRowStatus =
  'none' | 'unknown' | 'filterable' | 'not-numeric' | 'stray-part';

/**
 * The name the catalog counts a row under — its key without the part a set's
 * row names (FR-CAT-10): "Colour (cup)" on a cup and lid is a Colour row.
 */
export function attributeRowKey(
  row: ProductAttribute,
  parts: readonly string[] = [],
): string {
  return splitAttributeKey(row.key, parts).key;
}

/**
 * `stray-part` is the set's typo: a product sold as a set, a row whose key
 * ends in a parenthesis naming none of its parts, and a name before it that
 * the shop filters by — "Colour (Cup)" where the parts are "cup" and "lid".
 * All three, so it cannot fire on a product that is not a set, on a key the
 * catalog already carries as it stands ("Volume (ml)" elsewhere), or on a
 * name nothing filters by, where a parenthesis loses nothing.
 */
export function attributeRowStatus(
  row: ProductAttribute,
  hints: ReadonlyMap<string, AttributeHint>,
  parts: readonly string[] = [],
): AttributeRowStatus {
  const key = attributeRowKey(row, parts);
  if (!key) return 'none';
  const hint = hints.get(key);
  if (parts.length > 0 && hint?.type == null && !hint?.productCount) {
    const stray = strayPart(key, parts);
    if (stray && hints.get(stray.key)?.type != null) return 'stray-part';
  }
  if (!hint || !attributeIsKnown(hint)) return 'unknown';
  // A value that does not read as a number drops out of its own facet
  // (FR-ATTR-03) — the one place the editor can say so before it is saved.
  if (
    hint.type === 'number' &&
    row.value.trim() !== '' &&
    parseAttributeNumber(row.value) === null
  ) {
    return 'not-numeric';
  }
  return hint.type === null ? 'none' : 'filterable';
}

/**
 * Whether anything but the edited product knows the name — a definition
 * declaring it, or another product carrying it. A name only this product uses
 * is exactly the unmatched case, whether or not it has been saved once.
 */
export function attributeIsKnown(hint: AttributeHint): boolean {
  return hint.productCount > 0 || hint.type !== null;
}
