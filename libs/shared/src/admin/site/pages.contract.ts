import { oc } from '@orpc/contract';
import {
  CONSENT_LABEL_MAX_LENGTH,
  consentLabelParts,
  isConsentPage,
  PAGE_BODY_MAX_LENGTH,
  PAGE_TITLE_MAX_LENGTH,
  RICH_TEXT_IMAGE_ALIGNMENTS,
} from '../../core/site/pages';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { pageSchema, pageSlugSchema } from '../../core/site/page.contract';

/** One past save, as the editor's history lists it. */
export const pageVersionSchema = pageSchema.extend({
  /** Null for seeded content, or a version older than the record of who. */
  editorEmail: z.string().nullable(),
});
export type PageVersion = z.infer<typeof pageVersionSchema>;

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
    /**
     * Required on a consent page, refused on any other. Marks the words that
     * link the consent text with square brackets, exactly once.
     */
    consentLabel: z
      .string()
      .trim()
      .min(1)
      .max(CONSENT_LABEL_MAX_LENGTH)
      .refine((label) => consentLabelParts(label) !== null, {
        message: 'Mark the linked words with one pair of square brackets.',
      })
      .optional(),
  })
  .strict();
export type UpdatePageRequest = z.infer<typeof updatePageSchema>;

export type RichTextImageAlignment =
  (typeof RICH_TEXT_IMAGE_ALIGNMENTS)[number];

export const adminPagesContract = {
  updatePage: oc
    .route({
      method: 'PUT',
      path: '/pages/{slug}',
      inputStructure: 'detailed',
      summary: 'Replace a page title and body (admin only; body is sanitized)',
    })
    .errors({ ...commonAuthErrors, 'page-not-found': { status: 404 } })
    .input(
      z
        .object({
          // The enum makes "create a page" unrepresentable: an unknown slug is a
          // 400 from contract validation, never an insert.
          params: z.object({ slug: pageSlugSchema }),
          body: updatePageSchema,
        })
        .refine(
          ({ params, body }) =>
            isConsentPage(params.slug) === (body.consentLabel !== undefined),
          {
            message:
              'A consent page needs its box wording; no other page has one.',
            path: ['body', 'consentLabel'],
          },
        ),
    )
    .output(pageSchema),

  listPageVersions: oc
    .route({
      method: 'GET',
      path: '/pages/{slug}/versions',
      inputStructure: 'detailed',
      summary: 'Every saved version of a page, newest first (admin only)',
    })
    .errors(commonAuthErrors)
    .input(z.object({ params: z.object({ slug: pageSlugSchema }) }))
    .output(z.array(pageVersionSchema)),
};
