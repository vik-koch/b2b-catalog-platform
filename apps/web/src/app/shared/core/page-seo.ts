import { DestroyRef, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/** The shop's own document title, for a page that has no name of its own. */
export function shopTitle(branding: {
  readonly name: string;
  readonly tagline: string;
}): string {
  return `${branding.name} — ${branding.tagline}`;
}

/**
 * Keeps the document `<title>` (and optional meta description) in sync with the
 * current page, for SSR and client navigation alike (NFR-SEO-01). The page name
 * is composed with the shop's name — `"<page> — <shop>"` — falling back to the
 * shop's own title while the name is still null/undefined (e.g. a resource
 * loading or a not-found). Call from a component's injection context;
 * the reactive `name`/`description` getters re-run as their signals settle.
 */
export function usePageSeo(opts: {
  name: () => string | null | undefined;
  description?: () => string | null | undefined;
  /** Keeps the page out of the index (NFR-SEO-04): `true` for a view that is a
   * lens on content indexed elsewhere, a function for a page that learns it
   * late, like a hidden product. */
  noindex?: boolean | (() => boolean);
  /**
   * Suppresses the `Referer` header this document sends (ADR 0038). For a page
   * whose URL is itself the credential — the order token — so that following a
   * link off it cannot hand the token to whoever is on the other end.
   */
  noreferrer?: boolean;
}): void {
  const title = inject(Title);
  const meta = inject(Meta);
  const branding = inject(DEPLOYMENT_CONFIG).branding;

  effect(() => {
    const name = opts.name();
    title.setTitle(name ? `${name} — ${branding.name}` : shopTitle(branding));
  });

  const noindex = opts.noindex;
  if (noindex) {
    // Only a tag this page added is taken away: a non-indexable deployment
    // carries its own (seo.server.ts), stricter, which must stay.
    let added = false;
    const unmark = () => {
      if (added) meta.removeTag('name="robots"');
      added = false;
    };
    effect(() => {
      const wanted = noindex === true || noindex();
      if (wanted && !meta.getTag('name="robots"')) {
        meta.addTag({ name: 'robots', content: 'noindex' });
        added = true;
      } else if (!wanted) {
        unmark();
      }
    });
    inject(DestroyRef).onDestroy(unmark);
  }

  if (opts.noreferrer) {
    // Removed on the way out for the same reason as the robots tag: a
    // client-side navigation away must not leave the whole app referrer-less.
    meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    inject(DestroyRef).onDestroy(() => meta.removeTag('name="referrer"'));
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
