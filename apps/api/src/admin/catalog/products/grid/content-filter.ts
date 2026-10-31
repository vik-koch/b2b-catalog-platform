import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, isNull, not, or, SQL, sql } from 'drizzle-orm';
import {
  INCOMPLETE_GAPS,
  IncompleteGap,
  PRODUCT_FEATURES,
  ProductFeature,
  ProductGap,
  ProductGapFilter,
} from '@b2b-catalog-platform/shared/admin/catalog';
import * as schema from '../../../../db/schema';
import {
  documentProducts,
  productAttributes,
  productPairings,
  products,
} from '../../../../db/schema';
import { resolvedPriceMinor } from '../../../../core/catalog/product-price';
import { involves } from '../../../../core/catalog/product-pairings';

type Db = NodePgDatabase<typeof schema>;

/**
 * "This product lacks this content" (FR-ADM-20), one predicate for both the
 * filter and a row's gaps. A description of nothing but markup is missing: the
 * editor can save an empty paragraph. A price is the default list's.
 */
function gapCondition(db: Db, gap: ProductGap): SQL {
  switch (gap) {
    case 'price':
      return isNull(resolvedPriceMinor(null));
    case 'picture':
      return sql`${products.images} = '[]'::jsonb`;
    case 'description':
      return sql`btrim(regexp_replace(${products.descriptionHtml}, '<[^>]*>|&nbsp;', '', 'g')) = ''`;
    case 'attributes':
      return not(
        exists(
          db
            .select({ one: sql`1` })
            .from(productAttributes)
            .where(eq(productAttributes.productId, products.id)),
        ),
      );
    case 'packaging':
      return isNull(products.piecesPerPack);
    // Either figure is something to show; neither is the gap.
    case 'boxFacts':
      return sql`(${isNull(products.boxVolume)} and ${isNull(products.boxWeight)})`;
  }
}

/** The filter form: every entry must hold. */
export function missingCondition(
  db: Db,
  missing: readonly ProductGapFilter[],
): SQL | undefined {
  return and(...missing.map((entry) => missingEntry(db, entry)));
}

/** One entry: a gap, or `incomplete` for any of the four. */
function missingEntry(db: Db, missing: ProductGapFilter): SQL | undefined {
  if (missing !== 'incomplete') return gapCondition(db, missing);
  return or(...INCOMPLETE_GAPS.map((gap) => gapCondition(db, gap)));
}

/** The select-list form: one boolean column per gap a row names. */
export function incompleteGapColumns(
  db: Db,
): Record<IncompleteGap, SQL<boolean>> {
  return Object.fromEntries(
    INCOMPLETE_GAPS.map((gap) => [gap, gapCondition(db, gap) as SQL<boolean>]),
  ) as Record<IncompleteGap, SQL<boolean>>;
}

/** The filter form of the other half: every feature asked for must hold. */
export function featureCondition(
  db: Db,
  features: readonly ProductFeature[],
): SQL | undefined {
  return and(...features.map((feature) => featurePredicate(db, feature)));
}

/** The select-list form: one boolean column per feature, drawn as glyphs. */
export function featureColumns(db: Db): Record<ProductFeature, SQL<boolean>> {
  return Object.fromEntries(
    PRODUCT_FEATURES.map((feature) => [
      feature,
      featurePredicate(db, feature) as SQL<boolean>,
    ]),
  ) as Record<ProductFeature, SQL<boolean>>;
}

/** "This product carries this kind of content". */
function featurePredicate(db: Db, feature: ProductFeature): SQL {
  switch (feature) {
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
