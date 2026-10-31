import { oc } from '@orpc/contract';
import * as z from 'zod';
import { PAGE_SLUGS } from './pages';

export const pageSlugSchema = z.enum(PAGE_SLUGS);

/**
 * The version of the consent text the person ticked. Absent where the form
 * asked nothing because the deployment does not ask for that purpose.
 */
export const consentVersionField = z.number().int().positive().optional();

export const pageSchema = z.object({
  /** Counts the page's saves; a consent is recorded against it. */
  version: z.number().int().positive(),
  title: z.string(),
  bodyHtml: z.string(),
  /** The wording beside the box, on a consent page only. */
  consentLabel: z.string().nullable(),
  /** When this version was saved; who saved it stays with the staff. */
  updatedAt: z.iso.datetime(),
});
export type Page = z.infer<typeof pageSchema>;

export const pageContract = {
  getPage: oc
    .route({
      method: 'GET',
      path: '/pages/{slug}',
      inputStructure: 'detailed',
      summary: 'Get page content',
    })
    .errors({ 'page-not-found': { status: 404 } })
    // Not the slug enum: an unknown slug is a missing page, a 404.
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(pageSchema),
};
