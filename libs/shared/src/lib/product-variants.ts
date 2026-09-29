/**
 * A product's variants (FR-CAT-11/12): the colours or designs one assorted
 * article comes in, named so its pictures can say which is which. A variant
 * sells nothing — it has no price, stock or cart line of its own.
 *
 * Import-free on purpose: the editor, the storefront and the API all read
 * these, and none of them should pull Zod in for a lookup.
 */

/** Most variants a product lists. The list is read at a glance, not searched. */
export const PRODUCT_VARIANTS_MAX = 20;

/** Longest variant name. It is a label over a picture, and has one line. */
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
