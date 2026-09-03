import * as z from 'zod';
import { ACCEPTED_IMAGE_MIME_TYPES } from './media-constants';
import { catalogImageSchema } from './catalog.contract';

export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/** What the upload endpoint returns: the stable same-origin URL to reference.
 * Alt text is set on the `<img>` node by the editor and lives in the page body,
 * not with the asset. */
export const uploadMediaResponseSchema = z.object({
  url: z.string(),
});
export type UploadMediaResponse = z.infer<typeof uploadMediaResponseSchema>;

/** The catalog upload endpoint returns a `{ full, thumb }` pair, i.e. exactly a
 * stored `CatalogImage` ready to drop into a product's gallery. */
export const uploadCatalogImageResponseSchema = catalogImageSchema;
export type UploadCatalogImageResponse = z.infer<
  typeof uploadCatalogImageResponseSchema
>;
