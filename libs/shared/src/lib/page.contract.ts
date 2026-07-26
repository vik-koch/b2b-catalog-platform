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
export const pageSlugSchema = z.enum(PAGE_SLUGS);

/**
 * The rich-text vocabulary, declared once and isomorphic on purpose:
 * the server sanitizer (`sanitizeRichText`, shared/node) strips everything not
 * listed here, and the editor's schema is configured from the same constants —
 * so the editor cannot produce markup the server would silently drop.
 *
 * Deliberately absent: `h1` (the page title renders the page's only h1, so
 * bodies start at h2), tables (may be added later), and anything
 * carrying `class`/`style`.
 */
export const RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
  'img',
] as const;

/** Link targets we accept. `javascript:`/`data:` are the reason this is a list. */
export const RICH_TEXT_LINK_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * Image alignment is a closed enum, never free-form CSS: the sanitizer
 * allowlists it by string comparison and our own styles render it (block with
 * auto margins for `center`; float so text wraps for `left`/`right`).
 */
export const RICH_TEXT_IMAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;
export type RichTextImageAlignment =
  (typeof RICH_TEXT_IMAGE_ALIGNMENTS)[number];

/**
 * Image width is a free percentage of the container, carried as a `data-width`
 * integer in this inclusive range. It stays allowlistable despite being free:
 * the value is a bounded integer the sanitizer validates by pattern and range,
 * from which it reconstructs the inline `width` style — it never parses CSS.
 */
export const RICH_TEXT_IMAGE_WIDTH_MIN = 1;
export const RICH_TEXT_IMAGE_WIDTH_MAX = 100;

/** Matches the `pages.title` varchar. */
export const PAGE_TITLE_MAX_LENGTH = 255;

/**
 * A DoS guard, not an editorial rule — far more than any static page needs.
 * Kept comfortably below Express's default 100 KB body limit so an oversized
 * body fails contract validation with a 400 the editor can explain, rather than
 * being cut off by the body parser with an opaque 413.
 */
export const PAGE_BODY_MAX_LENGTH = 64_000;

export const pageSchema = z.object({
  title: z.string(),
  bodyHtml: z.string(),
  /**
   * ISO 8601. Public because legal pages conventionally show when they last
   * changed. No edit history is kept — this is the only temporal fact about
   * a page. The editing admin is recorded in the database but deliberately
   * not exposed here: this endpoint is public.
   */
  updatedAt: z.string().datetime(),
});
export type Page = z.infer<typeof pageSchema>;

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(PAGE_TITLE_MAX_LENGTH),
  /**
   * Accepted as-is and sanitized server-side before it is stored, so what the
   * client sent is never what gets persisted. May legitimately be empty: an
   * emptied editor posts `''`.
   */
  bodyHtml: z.string().max(PAGE_BODY_MAX_LENGTH),
});
export type UpdatePageRequest = z.infer<typeof updatePageSchema>;

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
  updatePage: {
    method: 'PUT',
    path: '/pages/:slug',
    // The enum makes "create a page" unrepresentable: an unknown slug is a 400
    // from contract validation, never an insert.
    pathParams: z.object({ slug: pageSlugSchema }),
    body: updatePageSchema,
    responses: {
      200: pageSchema,
      401: z.object({ message: z.string() }),
      403: z.object({ message: z.string() }),
      404: z.object({ message: z.string() }),
    },
    summary: 'Replace a page title and body (admin only; body is sanitized)',
  },
});
