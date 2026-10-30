import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, SQL, sql } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import { documentProducts, products } from '../../../../db/schema';

/** "This product shows this document": where the document list's count
 * leads (FR-DOC-02). */
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
