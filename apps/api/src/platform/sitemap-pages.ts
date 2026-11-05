/**
 * The stored pages for the sitemap the catalog serves. Neither area may
 * import the other, so site answers through this and the app root wires it.
 */
export interface SitemapPages {
  /** Each page once, with its newest version's time, by slug. */
  list(): Promise<{ slug: string; updatedAt: Date }[]>;
}

export const SITEMAP_PAGES = 'SITEMAP_PAGES';
