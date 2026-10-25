import { oc } from '@orpc/contract';
import { PAGE_SLUGS } from './page-constants';
import * as z from 'zod';

export const pageSlugSchema = z.enum(PAGE_SLUGS);

/**
 * The version of the consent text a form showed and the person ticked
 * (NFR-LEGAL-09). Absent where the form asked nothing: the deployment does not
 * publish that purpose's text.
 */
export const consentVersionField = z.number().int().positive().optional();

export const pageSchema = z.object({
  /** Counts the page's saves; a consent is recorded against it. */
  version: z.number().int().positive(),
  title: z.string(),
  bodyHtml: z.string(),
  /** The wording beside the box, on a consent page only. */
  consentLabel: z.string().nullable(),
  /**
   * ISO 8601, when this version was saved. Public because legal pages
   * conventionally show when they last changed; who saved it is not.
   */
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
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(pageSchema),
};
