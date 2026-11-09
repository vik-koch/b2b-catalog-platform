import * as z from 'zod';

import { pageSlugSchema } from './page.contract';
import { isConsentPage, PAGE_SLUGS } from './pages';

/**
 * Which of the fixed `PAGE_SLUGS` this deployment has, and where they are
 * linked: whether an imprint is its own page is the jurisdiction's call. An
 * unpublished page is unreachable everywhere but keeps its row, so publishing
 * it again is a config change, not a restore.
 */
export const pagesConfigSchema = z
  .object({
    published: z.array(pageSlugSchema),
    /** Route segments in the order they appear. A page slug must be
     * published; a code route (`contact`) may be listed either way. */
    headerNav: z.array(z.string()),
    footerNav: z.array(z.string()),
  })
  .strict()
  .superRefine((pages, ctx) => {
    // Listed here, a consent text would read as a switch that does nothing.
    for (const slug of pages.published) {
      if (isConsentPage(slug)) {
        ctx.addIssue({
          code: 'custom',
          path: ['published'],
          message: `"${slug}" is switched by consent, not published here`,
        });
      }
    }
    // Else every page's chrome would carry a link to a 404.
    const published = new Set<string>(pages.published);
    const isPage = (s: string): boolean =>
      (PAGE_SLUGS as readonly string[]).includes(s);
    for (const key of ['headerNav', 'footerNav'] as const) {
      for (const segment of pages[key]) {
        if (isPage(segment) && !published.has(segment)) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `"${segment}" is linked but not published`,
          });
        }
      }
    }
  });
