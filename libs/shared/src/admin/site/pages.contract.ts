import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { consentLabelParts, isConsentPage } from '../../core/site/pages';
import { pageSchema, pageSlugSchema } from '../../core/site/page.contract';
import {
  CONSENT_LABEL_MAX_LENGTH,
  PAGE_BODY_MAX_LENGTH,
  PAGE_TITLE_MAX_LENGTH,
} from './pages';

export const pageVersionSchema = pageSchema.extend({
  /** Null for seeded content, or a version older than the record of who. */
  editorEmail: z.string().nullable(),
});
export type PageVersion = z.infer<typeof pageVersionSchema>;

// strict also refuses a read-only field (`slug`, `updatedAt`) a client might
// believe it changed.
export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(PAGE_TITLE_MAX_LENGTH),
    /** Sanitized before it is stored. Empty is fine: an emptied editor. */
    bodyHtml: z.string().max(PAGE_BODY_MAX_LENGTH),
    /** Required on a consent page, refused on any other. */
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
          // The enum makes creating a page unrepresentable: an unknown slug is
          // a 400, never an insert.
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
