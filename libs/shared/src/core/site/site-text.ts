import type * as z from 'zod';
import { PAGE_SLUGS } from './pages';

/** The site's part of `texts/shared.json`: a name in `nav` for every page,
 * since a page or a mail may link any of them. */
export function requirePageNames(text: unknown, ctx: z.RefinementCtx): void {
  const nav = (text as { nav?: Record<string, unknown> }).nav ?? {};
  for (const slug of PAGE_SLUGS) {
    if (typeof nav[slug] !== 'string') {
      ctx.addIssue({
        code: 'custom',
        path: ['nav', slug],
        message: 'every page needs a name',
      });
    }
  }
}
