import { and, eq, exists, SQL, sql } from 'drizzle-orm';

import {
  documentProducts,
  products,
} from '../../../../core/catalog/catalog-schema';
import { Database } from '../../../../platform/db/database';

/** "This product shows this document": where the document list's count
 * leads (FR-DOC-02). */
export function documentCondition(
  db: Database,
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
