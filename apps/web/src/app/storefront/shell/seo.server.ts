import { SitemapEntry } from '@b2b-catalog-platform/shared/storefront/catalog';
import { requireEnv } from '../../../env';
import { getDeploymentConfig } from '../../platform/config/deployment-config.server';
import { isMaintenanceOn } from '../site/maintenance/maintenance.server';

/**
 * robots.txt, sitemap.xml and the `noindex` switch. Two things keep crawlers
 * out: `SEO_INDEXABLE`, per deployment, and maintenance mode, for a while.
 */

/** Off by default, so a new or misconfigured host is never crawled. */
function isIndexable(): boolean {
  return process.env['SEO_INDEXABLE'] === 'true';
}

function publicOrigin(): string {
  return requireEnv('APP_ORIGIN').replace(/\/+$/, '');
}

/** For a URL in XML or in a double-quoted attribute. */
function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Routes with no content timestamp, so no <lastmod>; pages come from the API.
const CODE_PATHS = ['/', '/catalog'];

// No crawler value: out of the sitemap, and disallowed as well.
const PRIVATE_PATHS = ['/admin', '/account', '/login', '/change-password'];

export async function renderRobots(): Promise<string> {
  const blocked = !isIndexable() || (await isMaintenanceOn());
  if (blocked) {
    return 'User-agent: *\nDisallow: /\n';
  }
  const origin = publicOrigin();
  const disallow = PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join('\n');
  return `User-agent: *\nAllow: /\n${disallow}\nSitemap: ${origin}/sitemap.xml\n`;
}

function urlEntry(origin: string, path: string, lastmod?: string): string {
  const loc = escapeMarkup(`${origin}${path}`);
  const mod = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return `  <url>\n    <loc>${loc}</loc>${mod}\n  </url>`;
}

// A short TTL rather than an invalidation hook: the URLs change on a sync.
const SITEMAP_TTL_MS = 5 * 60 * 1000;
let sitemapCache: { xml: string; at: number } | undefined;

/** 503 while maintenance gates the API, 404 where nothing is indexable. */
type SitemapResult =
  { kind: 'xml'; body: string } | { kind: 'status'; status: 404 | 503 };

function publishes(slug: string): boolean {
  return (
    getDeploymentConfig().site.pages.published as readonly string[]
  ).includes(slug);
}

export async function renderSitemap(): Promise<SitemapResult> {
  if (!isIndexable()) {
    return { kind: 'status', status: 404 };
  }
  if (sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) {
    return { kind: 'xml', body: sitemapCache.xml };
  }

  const response = await fetch(`${requireEnv('API_URL')}/catalog/sitemap`);
  // Passed on, so crawlers back off rather than cache an empty sitemap.
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

  const origin = publicOrigin();
  const urls = [
    ...CODE_PATHS.map((path) => urlEntry(origin, path)),
    // Every page row comes back; an unpublished one's route 404s.
    ...data.pages
      .filter((p) => publishes(p.slug))
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
 * `<link rel="canonical">` for the path without its query (NFR-SEO-04): sort,
 * page and filters are lenses on one category. Here, as only SSR knows the
 * public origin. None for a page marked `noindex` (run before
 * `injectNoindexMeta`, so that is the page's own tag) or a session route.
 */
export function injectCanonicalLink(html: string, path: string): string {
  if (html.includes('name="robots"')) return html;
  if (PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return html;
  }
  const href = escapeMarkup(`${publicOrigin()}${path}`);
  return html.replace(
    '</head>',
    `<link rel="canonical" href="${href}"></head>`,
  );
}

/** Beside robots.txt, for a page fetched directly. A page's own robots tag is
 * rewritten rather than joined by a second: the deployment's is stricter. */
const ROBOTS_META = /<meta[^>]*\bname="robots"[^>]*>/i;

export function injectNoindexMeta(html: string): string {
  if (isIndexable()) return html;
  const tag = `<meta name="robots" content="noindex, nofollow">`;
  return ROBOTS_META.test(html)
    ? html.replace(ROBOTS_META, tag)
    : html.replace('</head>', `${tag}</head>`);
}
