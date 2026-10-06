import * as z from 'zod';
import { PAGE_SLUGS } from './page-constants';
import { pageSlugSchema } from './page.contract';

/**
 * Which static pages this deployment has, and where they are linked. Shared,
 * because the API reads `published` too: a consent purpose (NFR-LEGAL-09) is
 * asked exactly when its page is published, and both sides must agree on it.
 *
 * The slug set is fixed in code (PAGE_SLUGS); what varies per deployment is
 * which of them exist and where they appear — whether a separate imprint page
 * is required, for instance, differs by jurisdiction, and the same details are
 * often carried on an about or contact page instead.
 *
 * An unpublished page is unreachable everywhere at once: its route stops
 * matching, it drops out of both navigations, the admin panel stops offering
 * it, and it leaves the sitemap. Its row stays in the database, so publishing
 * it again is a config change rather than a restore.
 */
export const pagesConfigSchema = z
  .object({
    /** Page bodies this deployment serves. */
    published: z.array(pageSlugSchema),
    /**
     * Route segments in the header's utility bar and the footer's legal nav,
     * in the order they appear. Page slugs must be published; code routes
     * (`contact`) may be listed either way.
     */
    headerNav: z.array(z.string()),
    footerNav: z.array(z.string()),
  })
  .strict()
  .superRefine((pages, ctx) => {
    // A link to an unpublished page would render a 404 into the chrome of
    // every page, so this is worth failing the boot over.
    const published = new Set<string>(pages.published);
    const isPage = (s: string): boolean =>
      (PAGE_SLUGS as readonly string[]).includes(s);
    for (const key of ['headerNav', 'footerNav'] as const) {
      for (const segment of pages[key]) {
        if (isPage(segment) && !published.has(segment)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `"${segment}" is linked but not published`,
          });
        }
      }
    }
  });
