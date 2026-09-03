import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';

/**
 * The static pages are a fixed set — content is edited, pages are never
 * created or deleted. The API answers 404 for any other slug. Which of them a
 * deployment publishes, and where they appear in the navigation, is deployment
 * config; the set itself is a compile-time contract shared with the database,
 * whose page rows are keyed by these slugs.
 */
export const PAGE_SLUGS = [
  'about',
  'conditions',
  'privacy',
  'imprint',
  'contact',
] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];
export const pageSlugSchema = z.enum(PAGE_SLUGS);

/**
 * The subset served by the generic `/:slug` route. `contact` is deliberately
 * absent: it has an editable body like the others, but a code route renders it
 * so the office list and map embeds — structured deployment config, not
 * content — keep their own markup around the prose.
 *
 * Which of these a given deployment actually publishes is a separate,
 * per-deployment decision (see the `pages` block in the deployment config).
 */
export const STANDALONE_PAGE_SLUGS = [
  'about',
  'conditions',
  'privacy',
  'imprint',
] as const satisfies readonly PageSlug[];
export type StandalonePageSlug = (typeof STANDALONE_PAGE_SLUGS)[number];

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
 * Image size is a free pixel width of the image itself, carried as a
 * `data-width` integer. It stays allowlistable despite being free: the value is
 * a bounded integer the sanitizer validates by pattern and range (1..the upload
 * cap), from which it reconstructs the inline `width` style — it never parses
 * CSS. The rendered image is capped at the container via CSS `max-width:100%`,
 * so a width wider than the column simply fills it rather than overflowing.
 *
 * The editor presents this as a percentage of the image's natural size (a "size"
 * slider); it converts to pixels before storing, so the stored value is always
 * absolute and resolution-honest.
 */
export const RICH_TEXT_IMAGE_SIZE_MIN_PERCENT = 1;
export const RICH_TEXT_IMAGE_SIZE_MAX_PERCENT = 100;

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
