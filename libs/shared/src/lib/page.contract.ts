import { oc } from '@orpc/contract';
import { PAGE_SLUGS } from './page-constants';
import * as z from 'zod';
import {
  PAGE_BODY_MAX_LENGTH,
  PAGE_TITLE_MAX_LENGTH,
  RICH_TEXT_IMAGE_ALIGNMENTS,
} from './page-constants';
import { commonAuthErrors } from './api-error';

export const pageSlugSchema = z.enum(PAGE_SLUGS);

export type RichTextImageAlignment =
  (typeof RICH_TEXT_IMAGE_ALIGNMENTS)[number];

export const pageSchema = z.object({
  title: z.string(),
  bodyHtml: z.string(),
  /**
   * ISO 8601. Public because legal pages conventionally show when they last
   * changed. No edit history is kept — this is the only temporal fact about
   * a page. The editing admin is recorded in the database but deliberately
   * not exposed here: this endpoint is public.
   */
  updatedAt: z.iso.datetime(),
});
export type Page = z.infer<typeof pageSchema>;

// strict: unknown keys are rejected, not stripped (NFR-SEC-05). It also stops a
// client from posting a read-only field (`slug`, `updatedAt`) and assuming it
// took effect.
export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(PAGE_TITLE_MAX_LENGTH),
    /**
     * Accepted as-is and sanitized server-side before it is stored, so what the
     * client sent is never what gets persisted. May legitimately be empty: an
     * emptied editor posts `''`.
     */
    bodyHtml: z.string().max(PAGE_BODY_MAX_LENGTH),
  })
  .strict();
export type UpdatePageRequest = z.infer<typeof updatePageSchema>;

export const pageContract = {
  getPage: oc
    .route({
      method: 'GET',
      path: '/pages/{slug}',
      inputStructure: 'detailed',
      summary: 'Get page content',
    })
    .errors({ 'page-not-found': { status: 404 } })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(pageSchema),

  updatePage: oc
    .route({
      method: 'PUT',
      path: '/pages/{slug}',
      inputStructure: 'detailed',
      summary: 'Replace a page title and body (admin only; body is sanitized)',
    })
    .errors({ ...commonAuthErrors, 'page-not-found': { status: 404 } })
    .input(
      z.object({
        // The enum makes "create a page" unrepresentable: an unknown slug is a
        // 400 from contract validation, never an insert.
        params: z.object({ slug: pageSlugSchema }),
        body: updatePageSchema,
      }),
    )
    .output(pageSchema),
};
