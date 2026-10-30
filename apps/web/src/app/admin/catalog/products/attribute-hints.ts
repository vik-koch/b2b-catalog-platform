import {
  AttributeType,
  parseAttributeNumber,
  ProductAttribute,
  splitAttributeKey,
  strayPart,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AttributeDefinition,
  AttributeKeyUsage,
} from '@b2b-catalog-platform/shared/admin/catalog';

/**
 * What the catalog knows about one attribute name: how many products carry
 * it, and whether the shop filters by it. From both the inventory and the
 * definitions, since a definition may come before any product carries it.
 */
export interface AttributeHint {
  key: string;
  productCount: number;
  /** From the definition of exactly this name, if there is one. */
  type: AttributeType | null;
  unit: string | null;
}

/**
 * Alphabetical, as the inventory. `ownKeys`, the edited product's keys at
 * load, are left out of the counts: otherwise a typo would stop being reported
 * the moment it was saved.
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
        // One at most: the inventory counts products, not rows.
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
 * Only the cases worth an icon; a freetext key others carry gets nothing.
 * `unknown` is a new attribute or a typo, cheapest to fix while typing.
 */
export type AttributeRowStatus =
  'none' | 'unknown' | 'filterable' | 'not-numeric' | 'stray-part';

/** Without the part a set's row names (FR-CAT-10): "Colour (cup)" counts as
 * Colour. */
export function attributeRowKey(
  row: ProductAttribute,
  parts: readonly string[] = [],
): string {
  return splitAttributeKey(row.key, parts).key;
}

/**
 * `stray-part` is a set's typo, "Colour (Cup)" for parts "cup" and "lid": a
 * set, a parenthesis naming none of its parts, and a filterable name before
 * it. All three, so a key carried elsewhere as it stands ("Volume (ml)") or a
 * name nothing filters by never fires.
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
  // It would drop out of its own facet (FR-ATTR-03).
  if (
    hint.type === 'number' &&
    row.value.trim() !== '' &&
    parseAttributeNumber(row.value) === null
  ) {
    return 'not-numeric';
  }
  return hint.type === null ? 'none' : 'filterable';
}

/** A definition declares it, or another product carries it. */

export function attributeIsKnown(hint: AttributeHint): boolean {
  return hint.productCount > 0 || hint.type !== null;
}

/** What a row's badges say, for the grid and the narrow list alike. */
export interface AttributeRowMarks {
  /** The shop filters by the key, whatever this row's value does. */
  filterable: boolean;
  /** A set's mistyped part, and the filter the row misses by it. */
  stray: { part: string; key: string } | null;
  /** The value drops out of its number facet (FR-ATTR-03). */
  notNumeric: boolean;
  /** The declared unit; an empty value keeps it, as the hint of what to type. */
  unit: string | null;
}

export function attributeRowMarks(
  row: ProductAttribute,
  hints: ReadonlyMap<string, AttributeHint>,
  parts: readonly string[] = [],
): AttributeRowMarks {
  const status = attributeRowStatus(row, hints, parts);
  const stray = status === 'stray-part' ? strayPart(row.key, parts) : null;
  return {
    filterable: status === 'filterable' || status === 'not-numeric',
    stray: stray ? { part: stray.part ?? '', key: stray.key } : null,
    notNumeric: status === 'not-numeric',
    unit: hints.get(attributeRowKey(row, parts))?.unit ?? null,
  };
}
