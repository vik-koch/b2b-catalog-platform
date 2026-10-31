/**
 * A product's variants (FR-CAT-11/12): the colours or designs one assorted
 * article comes in, named so its pictures can say which is which. A variant
 * sells nothing: no price, stock or cart line of its own.
 */

/** The list is read at a glance, not searched. */
export const PRODUCT_VARIANTS_MAX = 20;

/** A variant name is a one-line label over a picture. */
export const PRODUCT_VARIANT_NAME_MAX_LENGTH = 40;

/** A variant as it is stored and edited. */
export interface StoredVariant {
  id: string;
  name: string;
  unavailable: boolean;
}

/** A picture as it is stored: which variant it shows, if any. */
export interface StoredPicture {
  full: string;
  thumb: string;
  variantId?: string | null;
}

/** Two names that differ only in case or surrounding space are one variant. */
export function variantNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** Whether a list of variants can be stored: distinct ids, distinct names. */
export function hasDistinctVariants(
  variants: readonly StoredVariant[],
): boolean {
  const ids = new Set(variants.map((variant) => variant.id));
  const names = new Set(
    variants.map((variant) => variantNameKey(variant.name)),
  );
  return ids.size === variants.length && names.size === variants.length;
}

/** Whether every picture that names a variant names one of these. */
export function picturesNameKnownVariants(
  pictures: readonly StoredPicture[],
  variants: readonly StoredVariant[],
): boolean {
  const ids = new Set(variants.map((variant) => variant.id));
  return pictures.every(
    (picture) => picture.variantId == null || ids.has(picture.variantId),
  );
}

/**
 * The pictures a storefront shows, in gallery order, each with its variant's
 * name. A picture of an unavailable variant is withheld (FR-CAT-12); one naming
 * a variant that no longer exists shows none, so a stale reference cannot fail
 * the response.
 */
export function shownPictures(
  pictures: readonly StoredPicture[],
  variants: readonly StoredVariant[],
): { full: string; thumb: string; variant: string | null }[] {
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  return pictures.flatMap((picture) => {
    const variant = picture.variantId ? byId.get(picture.variantId) : undefined;
    if (variant?.unavailable) return [];
    return [
      {
        full: picture.full,
        thumb: picture.thumb,
        variant: variant?.name ?? null,
      },
    ];
  });
}
