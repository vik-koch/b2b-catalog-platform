import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, SQL, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { documentProducts, products } from '../db/schema';

/**
 * "This product shows this document" — what the admin grid filters on when the
 * document list's product count is followed (FR-DOC-02).
 *
 * An `exists` subquery, written like the tier-price filter beside it: the two
 * read as one kind of question — which products did somebody attach this to —
 * and the product-leading index on `document_products` is what makes it cheap.
 */
export function documentCondition(
  db: NodePgDatabase<typeof schema>,
  documentId: string | undefined,
): SQL | undefined {
  if (!documentId) return undefined;

  return exists(
    db
      .select({ one: sql`1` })
      .from(documentProducts)
      .where(
        and(
          eq(documentProducts.productId, products.id),
          eq(documentProducts.documentId, documentId),
        ),
      ),
  );
}
