import { effect, inject } from '@angular/core';
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
}): void {
  const title = inject(Title);
  const meta = inject(Meta);
  const base = inject(DEPLOYMENT_CONFIG).branding.title;

  effect(() => {
    const name = opts.name();
    title.setTitle(name ? `${name} — ${base}` : base);
  });

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
