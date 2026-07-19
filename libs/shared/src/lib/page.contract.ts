import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * The static pages are a fixed set — content is edited, pages are never
 * created or deleted. The web router only matches these slugs; the API
 * answers 404 for anything else.
 */
export const PAGE_SLUGS = [
  'about',
  'conditions',
  'privacy',
  'imprint',
] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const pageSchema = z.object({
  title: z.string(),
  bodyHtml: z.string(),
});
export type Page = z.infer<typeof pageSchema>;

export const pageContract = c.router({
  getPage: {
    method: 'GET',
    path: '/pages/:slug',
    responses: {
      200: pageSchema,
      404: z.object({ message: z.string() }),
    },
    summary: 'Get page content',
  },
});
