import {
  SitemapEntry,
  STANDALONE_PAGE_SLUGS,
} from '@b2b-catalog-platform/shared';
import { requireEnv } from '../../env';
import { getDeploymentConfig } from './deployment-config.server';
import { isMaintenanceOn } from './maintenance.server';

/**
 * Server-side SEO surface: robots.txt, sitemap.xml, and the environment-level
 * `noindex` switch. Lives with the other `.server.ts` config so the browser
 * bundle never imports it.
 *
 * Two independent suppression axes combine here: `SEO_INDEXABLE` (permanent,
 * per-deployment — dev and the demo stay out of the index) and maintenance mode
 * (temporary, runtime). Either one disallows crawling.
 */

/** Whether this deployment opts in to being indexed. Defaults to false so a new
 * or misconfigured host is never accidentally crawled. */
export function isIndexable(): boolean {
  return process.env['SEO_INDEXABLE'] === 'true';
}

// Code routes that belong in the sitemap but have no content timestamp, so
// they carry no <lastmod> (deliberately — see the DB-backed entries below,
// which do). The static *page* slugs (about/privacy/…) are not here: they come
// from the API with their real updatedAt. `/contact` is a code route even
// though it now has an editable body, so it stays in this list.
const CODE_PATHS = ['/', '/catalog'];

// Session/admin routes: client-rendered shells with no crawler value. Kept out
// of the sitemap and explicitly disallowed in robots.txt as defence-in-depth.
const PRIVATE_PATHS = ['/admin', '/account', '/login', '/change-password'];

/**
 * robots.txt body. Disallows everything unless the deployment is indexable and
 * not under maintenance; otherwise allows all but the private/session routes
 * and advertises the sitemap.
 */
export async function renderRobots(): Promise<string> {
  const blocked = !isIndexable() || (await isMaintenanceOn());
  if (blocked) {
    return 'User-agent: *\nDisallow: /\n';
  }
  const origin = requireEnv('APP_ORIGIN').replace(/\/+$/, '');
  const disallow = PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join('\n');
  return `User-agent: *\nAllow: /\n${disallow}\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Escapes the five XML entities in a URL before it goes into <loc>. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(origin: string, path: string, lastmod?: string): string {
  const loc = xmlEscape(`${origin}${path}`);
  const mod = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return `  <url>\n    <loc>${loc}</loc>${mod}\n  </url>`;
}

// The rendered XML is cached in-process behind a short TTL rather than a
// sync-invalidation hook: the URL set changes only on catalog sync,
// so a brief staleness window is acceptable and keeps this off the hot path.
const SITEMAP_TTL_MS = 5 * 60 * 1000;
let sitemapCache: { xml: string; at: number } | undefined;

/**
 * Result of a sitemap request: either the rendered document, or a status the
 * route should return in place of it — `503` while maintenance gates the API,
 * `404` when the deployment is not indexable.
 */
export type SitemapResult =
  | { kind: 'xml'; body: string }
  | { kind: 'status'; status: 404 | 503 };

function publishes(slug: string): boolean {
  return (getDeploymentConfig().pages.published as readonly string[]).includes(
    slug,
  );
}

/** Published page slugs that have their own `/:slug` route. */
function standalonePagePaths(): Set<string> {
  const published = new Set<string>(getDeploymentConfig().pages.published);
  return new Set(
    (STANDALONE_PAGE_SLUGS as readonly string[]).filter((slug) =>
      published.has(slug),
    ),
  );
}

export async function renderSitemap(): Promise<SitemapResult> {
  if (!isIndexable()) {
    return { kind: 'status', status: 404 };
  }
  if (sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) {
    return { kind: 'xml', body: sitemapCache.xml };
  }

  const response = await fetch(`${requireEnv('API_URL')}/catalog/sitemap`);
  // The maintenance guard 503s this endpoint like the rest of the read API;
  // surface it so crawlers back off instead of caching an empty sitemap.
  if (response.status === 503) {
    return { kind: 'status', status: 503 };
  }
  if (!response.ok) {
    throw new Error(`Sitemap source responded ${response.status}`);
  }
  const data = (await response.json()) as {
    categories: SitemapEntry[];
    products: SitemapEntry[];
    pages: SitemapEntry[];
  };

  const origin = requireEnv('APP_ORIGIN').replace(/\/+$/, '');
  const urls = [
    ...CODE_PATHS.map((path) => urlEntry(origin, path)),
    // `/contact` is a code route, but publishing governs it like a page.
    ...(publishes('contact') ? [urlEntry(origin, '/contact')] : []),
    // The API returns every page row; only the ones this deployment publishes
    // on their own route belong in the sitemap. Without this filter an
    // unpublished page would keep being advertised to crawlers while its route
    // 404s, and `/contact` would be listed twice (it is in CODE_PATHS).
    ...data.pages
      .filter((p) => standalonePagePaths().has(p.slug))
      .map((p) => urlEntry(origin, `/${p.slug}`, p.updatedAt)),
    ...data.categories.map((c) =>
      urlEntry(origin, `/catalog/${c.slug}`, c.updatedAt),
    ),
    ...data.products.map((p) =>
      urlEntry(origin, `/product/${p.slug}`, p.updatedAt),
    ),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls.join('\n')}\n` +
    `</urlset>\n`;

  sitemapCache = { xml, at: Date.now() };
  return { kind: 'xml', body: xml };
}

/**
 * Escapes the characters that could break out of a double-quoted HTML
 * attribute. The path comes from the request line, so it is not ours.
 */
function attrEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Injects `<link rel="canonical">` naming the requested path, without its query
 * string (NFR-SEO-04). Sort, page and attribute filters each turn one category
 * into an arbitrary number of URLs — filters combinatorially many — and every
 * one of them is the same content seen through a lens, so they all point at the
 * plain category.
 *
 * Written here rather than by the component that renders the page, for the same
 * reason the sitemap is: only the SSR tier knows the public origin the document
 * is reached at, and a crawler only ever reads the initial HTML of the URL it
 * fetched. A client-side navigation therefore leaves the tag alone — the
 * document it would update is one no crawler has.
 *
 * Two documents get none. A view that has already marked itself `noindex`
 * (search results, FR-SEARCH-\*) needs no preferred URL, and this runs before
 * `injectNoindexMeta` so that check sees only the page's own tag, never the
 * deployment-level one. And the session routes have no crawler value at all.
 */
export function injectCanonicalLink(html: string, path: string): string {
  if (html.includes('name="robots"')) return html;
  if (PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return html;
  }
  const origin = requireEnv('APP_ORIGIN').replace(/\/+$/, '');
  const href = attrEscape(`${origin}${path}`);
  return html.replace('</head>', `<link rel="canonical" href="${href}"></head>`);
}

/**
 * Injects `<meta name="robots" content="noindex, nofollow">` into an SSR
 * document when the deployment is not indexable — belt-and-braces alongside
 * robots.txt so a directly-fetched page is also marked.
 */
export function injectNoindexMeta(html: string): string {
  if (isIndexable()) return html;
  return html.replace(
    '</head>',
    `<meta name="robots" content="noindex, nofollow"></head>`,
  );
}
