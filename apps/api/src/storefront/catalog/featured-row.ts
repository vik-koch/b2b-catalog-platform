import { desc, isNull, ne, or, sql } from 'drizzle-orm';
import { products } from '../../db/schema';

/**
 * What the main page's row may draw on (FR-CAT-09) beyond being visible:
 * anything but an empty shelf, featured products included. Untracked stock
 * counts as on hand.
 */
export const featuredRowCandidate = or(
  isNull(products.availability),
  ne(products.availability, 'out'),
);

/** Featured products first, each half at random, so a `limit` takes as many
 * featured ones as fit and fills the rest at random. */
export const featuredRowOrder = [desc(products.featured), sql`random()`];

/** A copy in random order (Fisher–Yates), so the row does not say which
 * products were featured. */
export function shuffled<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
