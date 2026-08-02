import { DestroyRef, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/**
 * Keeps the document `<title>` (and optional meta description) in sync with the
 * current page, for SSR and client navigation alike (NFR-SEO-01). The page name
 * is composed with the deployment's shop title — `"<name> — <shop>"` — falling
 * back to the bare shop title while the name is still null/undefined (e.g. a
 * resource loading or a not-found). Call from a component's injection context;
 * the reactive `name`/`description` getters re-run as their signals settle.
 */
export function usePageSeo(opts: {
  name: () => string | null | undefined;
  description?: () => string | null | undefined;
  /**
   * Keeps this route out of the index (NFR-SEO-04) — for views that are a lens
   * on content indexed elsewhere, like search results. Set once per component,
   * not reactive: a route either is such a view or it is not.
   */
  noindex?: boolean;
}): void {
  const title = inject(Title);
  const meta = inject(Meta);
  const brandingName = inject(DEPLOYMENT_CONFIG).branding.name;
  const brandingTitle = inject(DEPLOYMENT_CONFIG).branding.title;

  effect(() => {
    const name = opts.name();
    title.setTitle(name ? `${name} — ${brandingName}` : brandingTitle);
  });

  if (opts.noindex) {
    // `updateTag` rather than `addTag`: a deployment that is itself
    // non-indexable already injects a robots tag (see seo.server.ts), and two
    // of them on one page is worse than the strictest one winning. Removed on
    // the way out so a client-side navigation to an ordinary page does not
    // inherit it.
    meta.updateTag({ name: 'robots', content: 'noindex' });
    inject(DestroyRef).onDestroy(() => meta.removeTag('name="robots"'));
  }

  const describe = opts.description;
  if (describe) {
    effect(() => {
      const description = describe();
      if (description) {
        meta.updateTag({ name: 'description', content: description });
      } else {
        meta.removeTag('name="description"');
      }
    });
  }
}
