import * as z from 'zod';

/** A product named in a reply: the handle and what identifies it on screen. */
export const productRefSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
  })
  .strict();

/**
 * A product another record links to, a pairing (FR-SET-01) or a document
 * (FR-DOC-02), as its editor lists it. A soft delete is reversible and an
 * unpublished product is usually one still being prepared, so the link stays
 * and the row is marked rather than dropped.
 */
export const linkedProductSchema = productRefSchema
  .extend({
    /** Soft-deleted; the storefront does not show it. */
    deleted: z.boolean(),
    /** Never published, or taken off the storefront again. */
    unpublished: z.boolean(),
  })
  .strict();
export type LinkedProduct = z.infer<typeof linkedProductSchema>;
