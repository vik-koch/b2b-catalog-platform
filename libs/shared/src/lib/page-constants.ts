/**
 * The fixed set of page slugs (0027), and the subset that has its own route
 * rather than being served by the generic page component. Plain data with no
 * imports, so routing can read it without pulling the page schemas — and Zod —
 * into the first load (see `auth-constants.ts` for why).
 */

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
