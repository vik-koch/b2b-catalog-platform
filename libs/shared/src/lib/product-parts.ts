/**
 * A product sold as a set of parts (FR-CAT-10) — a cup with its lid, listed,
 * priced and counted as one piece. The parts are a few words that say what the
 * piece is made of; they change nothing about how it is sold.
 *
 * Import-free on purpose: the editor and the storefront both read these, and
 * neither should pull Zod in for a string split.
 */

/** Fewest parts that make a set — one part is just the product. */
export const PRODUCT_PARTS_MIN = 2;

/** Most parts a set names. The badge lists them all, and it has one line. */
export const PRODUCT_PARTS_MAX = 3;

/** Longest single part name (matches `product_attributes.part`). */
export const PRODUCT_PART_MAX_LENGTH = 40;

/** What the editor's field separates parts with, and the marker joins them by. */
export const PRODUCT_PARTS_SEPARATOR = '+';

/**
 * Characters a part cannot contain: the separator, and the parentheses an
 * attribute key names it in — "Colour (cup)" could not be read back otherwise.
 */
const RESERVED = /[+()]/;

/** Whether one part name can be stored as it stands. */
export function isValidPart(part: string): boolean {
  return (
    part !== '' &&
    part === part.trim() &&
    part.length <= PRODUCT_PART_MAX_LENGTH &&
    !RESERVED.test(part)
  );
}

/**
 * Whether a list of parts can be stored: none, or two to three distinct valid
 * names.
 */
export function isValidPartList(parts: readonly string[]): boolean {
  if (parts.length === 0) return true;
  return (
    parts.length >= PRODUCT_PARTS_MIN &&
    parts.length <= PRODUCT_PARTS_MAX &&
    parts.every(isValidPart) &&
    new Set(parts).size === parts.length
  );
}

/** The editor's "cup + lid" as a list, empty pieces dropped. */
export function parsePartList(text: string): string[] {
  return text
    .split(PRODUCT_PARTS_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** The list as the editor and the marker write it: "cup + lid". */
export function formatPartList(parts: readonly string[]): string {
  return parts.join(` ${PRODUCT_PARTS_SEPARATOR} `);
}

/** An attribute key as stored: the name, and the part it describes. */
export interface PartKey {
  key: string;
  part: string | null;
}

/** "Colour (cup)": a name, then one parenthesised word group at the end. */
const PART_SUFFIX = /^(.*\S)\s*\(([^()]*)\)$/;

/**
 * Reads the part out of an attribute key, as a save stores it. Only a
 * parenthesis naming one of *this product's* parts is a part: "Volume (ml)" on
 * a product with no part called "ml" is a key like any other, because keys are
 * matched exactly and merging two of them is not this function's call.
 */
export function splitAttributeKey(
  key: string,
  parts: readonly string[],
): PartKey {
  const trimmed = key.trim();
  const match = PART_SUFFIX.exec(trimmed);
  if (match) {
    const part = match[2].trim();
    if (parts.includes(part)) return { key: match[1], part };
  }
  return { key: trimmed, part: null };
}

/**
 * A key that names a part this product does not have — "Colour (Cup)" on a
 * cup and lid — read as the name and the stray part, or null where the key
 * ends in no parenthesis or in one of the product's own parts.
 */
export function strayPart(
  key: string,
  parts: readonly string[],
): PartKey | null {
  const match = PART_SUFFIX.exec(key.trim());
  if (!match) return null;
  const part = match[2].trim();
  return parts.includes(part) ? null : { key: match[1], part };
}

/** The key as it was written, which is also how the product page shows it. */
export function joinAttributeKey({ key, part }: PartKey): string {
  return part === null ? key : `${key} (${part})`;
}
