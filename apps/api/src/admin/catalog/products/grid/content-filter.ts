import { and, eq, exists, isNotNull, not, SQL, sql } from 'drizzle-orm';

import {
  PRODUCT_FACTS,
  ProductFact,
} from '@b2b-catalog-platform/shared/admin/catalog';

import {
  documentProducts,
  productAttributes,
  productPairings,
  products,
} from '../../../../core/catalog/catalog-schema';
import { involves } from '../../../../core/catalog/product-pairings';
import { resolvedPriceMinor } from '../../../../core/catalog/product-price';
import { Database } from '../../../../platform/db/database';

/** The filter form: every entry of both lists must hold. Every predicate is
 * two-valued over NOT NULL columns, so `not` is its exact opposite. */
export function contentCondition(
  db: Database,
  has: readonly ProductFact[],
  missing: readonly ProductFact[],
): SQL | undefined {
  return and(
    ...has.map((fact) => factPredicate(db, fact)),
    ...missing.map((fact) => not(factPredicate(db, fact))),
  );
}

/** The select-list form: one boolean column per fact. */
export function factColumns(db: Database): Record<ProductFact, SQL<boolean>> {
  return Object.fromEntries(
    PRODUCT_FACTS.map((fact) => [
      fact,
      factPredicate(db, fact) as SQL<boolean>,
    ]),
  ) as Record<ProductFact, SQL<boolean>>;
}

/**
 * "This product carries this content" (FR-ADM-20), one predicate for the
 * filter and a row's facts. A description of nothing but markup is
 * missing: the editor can save an empty paragraph. A price is the default
 * list's.
 */
function factPredicate(db: Database, fact: ProductFact): SQL {
  switch (fact) {
    case 'price':
      return isNotNull(resolvedPriceMinor(null));
    case 'picture':
      return sql`${products.images} <> '[]'::jsonb`;
    case 'description':
      return sql`btrim(regexp_replace(${products.descriptionHtml}, '<[^>]*>|&nbsp;', '', 'g')) <> ''`;
    case 'attributes':
      return exists(
        db
          .select({ one: sql`1` })
          .from(productAttributes)
          .where(eq(productAttributes.productId, products.id)),
      );
    case 'packaging':
      return isNotNull(products.piecesPerPack);
    // Either figure is something to show.
    case 'boxFacts':
      return sql`(${isNotNull(products.boxVolume)} or ${isNotNull(products.boxWeight)})`;
    case 'featured':
      return eq(products.featured, true);
    case 'set':
      return sql`cardinality(${products.parts}) > 0`;
    case 'variants':
      return sql`${products.variants} <> '[]'::jsonb`;
    case 'note':
      return eq(products.lineNoteEnabled, true);
    case 'documents':
      return exists(
        db
          .select({ one: sql`1` })
          .from(documentProducts)
          .where(eq(documentProducts.productId, products.id)),
      );
    case 'pairings':
      return exists(
        db
          .select({ one: sql`1` })
          .from(productPairings)
          .where(involves(products.id)),
      );
  }
}
