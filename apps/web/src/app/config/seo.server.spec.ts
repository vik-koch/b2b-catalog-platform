import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Each test re-imports the module so the in-process sitemap/maintenance caches
 * start empty, and drives both the maintenance probe and the sitemap source
 * through a stubbed `fetch` keyed by URL.
 */
const OLD_ENV = process.env;

function stubFetch(handlers: {
  maintenance?: boolean;
  sitemap?: { status: number; body?: unknown };
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/maintenance')) {
        return new Response(
          JSON.stringify({ enabled: handlers.maintenance === true }),
          { status: 200 },
        );
      }
      if (url.endsWith('/catalog/sitemap')) {
        const s = handlers.sitemap ?? { status: 200, body: {} };
        return new Response(s.body ? JSON.stringify(s.body) : null, {
          status: s.status,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

async function load() {
  return import('./seo.server');
}

beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...OLD_ENV,
    API_URL: 'http://api:3000/api',
    APP_ORIGIN: 'https://shop.example',
  };
});

afterEach(() => {
  process.env = OLD_ENV;
  vi.unstubAllGlobals();
});

describe('injectNoindexMeta', () => {
  it('adds a noindex meta tag when the deployment is not indexable', async () => {
    process.env['SEO_INDEXABLE'] = 'false';
    const { injectNoindexMeta } = await load();
    expect(injectNoindexMeta('<head></head>')).toContain(
      '<meta name="robots" content="noindex, nofollow">',
    );
  });

  it('leaves the document untouched when indexable', async () => {
    process.env['SEO_INDEXABLE'] = 'true';
    const { injectNoindexMeta } = await load();
    expect(injectNoindexMeta('<head></head>')).toBe('<head></head>');
  });
});

describe('renderRobots', () => {
  it('disallows everything when the deployment is not indexable', async () => {
    process.env['SEO_INDEXABLE'] = 'false';
    stubFetch({ maintenance: false });
    const { renderRobots } = await load();
    expect(await renderRobots()).toBe('User-agent: *\nDisallow: /\n');
  });

  it('disallows everything while maintenance is on, even if indexable', async () => {
    process.env['SEO_INDEXABLE'] = 'true';
    stubFetch({ maintenance: true });
    const { renderRobots } = await load();
    expect(await renderRobots()).toContain('Disallow: /');
  });

  it('allows all and advertises the sitemap when indexable and live', async () => {
    process.env['SEO_INDEXABLE'] = 'true';
    stubFetch({ maintenance: false });
    const { renderRobots } = await load();
    const body = await renderRobots();
    expect(body).toContain('Allow: /');
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /account');
    expect(body).toContain('Sitemap: https://shop.example/sitemap.xml');
  });
});

describe('renderSitemap', () => {
  it('returns a 404 status when the deployment is not indexable', async () => {
    process.env['SEO_INDEXABLE'] = 'false';
    const { renderSitemap } = await load();
    expect(await renderSitemap()).toEqual({ kind: 'status', status: 404 });
  });

  it('surfaces the API 503 while maintenance gates the source', async () => {
    process.env['SEO_INDEXABLE'] = 'true';
    stubFetch({ sitemap: { status: 503 } });
    const { renderSitemap } = await load();
    expect(await renderSitemap()).toEqual({ kind: 'status', status: 503 });
  });

  it('builds absolute, escaped URLs with lastmod from the source', async () => {
    process.env['SEO_INDEXABLE'] = 'true';
    stubFetch({
      sitemap: {
        status: 200,
        body: {
          categories: [
            { slug: 'coffee-beans', updatedAt: '2026-01-01T00:00:00.000Z' },
          ],
          products: [
            { slug: 'hafen-espresso', updatedAt: '2026-02-02T09:30:00.000Z' },
          ],
          pages: [{ slug: 'about', updatedAt: '2026-04-04T08:00:00.000Z' }],
        },
      },
    });
    const { renderSitemap } = await load();
    const result = await renderSitemap();

    expect(result.kind).toBe('xml');
    const xml = result.kind === 'xml' ? result.body : '';
    // Static routes plus the catalog/product entries, all absolute.
    expect(xml).toContain('<loc>https://shop.example/</loc>');
    expect(xml).toContain('<loc>https://shop.example/catalog</loc>');
    expect(xml).toContain('<loc>https://shop.example/about</loc>');
    expect(xml).toContain(
      '<loc>https://shop.example/catalog/coffee-beans</loc>',
    );
    expect(xml).toContain(
      '<loc>https://shop.example/product/hafen-espresso</loc>',
    );
    expect(xml).toContain('<lastmod>2026-02-02T09:30:00.000Z</lastmod>');
    // The DB-backed page carries its real lastmod; code routes carry none.
    expect(xml).toContain('<lastmod>2026-04-04T08:00:00.000Z</lastmod>');
  });
});
