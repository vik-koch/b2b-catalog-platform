import { DestroyRef, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { DEPLOYMENT_CONFIG } from './config/deployment-config';

/** The shop's own document title, for a page that has no name of its own. */
export function shopTitle(branding: {
  readonly name: string;
  readonly tagline: string;
}): string {
  return `${branding.name} — ${branding.tagline}`;
}

/** The `<title>` as `"<page> — <shop>"` and the meta description, for SSR and
 * navigation alike (NFR-SEO-01); the shop's own title while the name is null.
 * Call in an injection context. */
export function usePageSeo(opts: {
  name: () => string | null | undefined;
  description?: () => string | null | undefined;
  /** Out of the index (NFR-SEO-04); a function for a page that learns it late. */
  noindex?: boolean | (() => boolean);
  /** For a page whose URL is the credential, so a link off it cannot pass the
   * token on in `Referer`. */
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
    // Only its own tag: a non-indexable deployment's stays.
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
    // Removed on leaving, or the whole app would go referrer-less.
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
