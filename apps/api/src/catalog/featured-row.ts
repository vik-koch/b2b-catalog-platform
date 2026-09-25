import { desc, isNull, ne, or, sql } from 'drizzle-orm';
import { products } from '../db/schema';

/**
 * What the main page's row may draw on (FR-CAT-09), on top of being publicly
 * visible: anything but an empty shelf. Untracked stock counts as on hand, as
 * it does everywhere else — nobody counting is not the same as nothing left.
 * A featured product is held to the same rule: the row exists to invite a
 * purchase, and one the shop would refuse is the wrong thing to open with.
 */
export const featuredRowCandidate = or(
  isNull(products.availability),
  ne(products.availability, 'out'),
);

/**
 * The featured products ahead of the rest, each half in a random order, so a
 * `limit` takes as many featured ones as fit and fills the remainder at random.
 * The draw is the order; which of them ends up where is `shuffled`'s job.
 */
export const featuredRowOrder = [desc(products.featured), sql`random()`];

/**
 * A copy in random order (Fisher–Yates). The query hands the featured products
 * back first, and the row must not say which they were.
 */
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
