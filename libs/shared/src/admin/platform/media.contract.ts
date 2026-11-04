import * as z from 'zod';

/** What the upload endpoint returns: the stable same-origin URL to reference.
 * Alt text lives on the `<img>` in the page body, not with the asset. */
export const uploadMediaResponseSchema = z.object({
  url: z.string(),
});
export type UploadMediaResponse = z.infer<typeof uploadMediaResponseSchema>;
