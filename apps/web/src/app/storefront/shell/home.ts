import { Component, inject } from '@angular/core';
import { CategoryIndex } from '../catalog/categories/category-index';
import { FeaturedRow } from '../catalog/featured/featured-row';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { usePageSeo } from '../../platform/page-seo';

/** The white band out to the window's edges, as a border image's outset:
 * paint, not layout, as a box sized to the viewport counts the scrollbar. */
const BAND =
  'bg-white [border-image:linear-gradient(#fff,#fff_calc(100%_-_5px),var(--color-surface))_fill_0/1/1rem_100vmax_0]';

/** The landing: an intro and featured products (FR-CAT-09) on the band,
 * then /catalog's category index (FR-CAT-01). */
@Component({
  imports: [CategoryIndex, FeaturedRow],
  selector: 'app-home',
  template: `
    <div [class]="band">
      <section class="pb-10">
        <p class="text-sm font-medium tracking-widest text-accent uppercase">
          {{ text.home.eyebrow }}
        </p>
        <h1
          class="mt-3 max-w-2xl text-3xl font-medium tracking-tight
                 sm:text-5xl"
        >
          {{ tagline }}
        </h1>
        <p class="mt-4 max-w-xl text-lg text-ink-subtle">
          {{ text.home.intro }}
        </p>
      </section>

      <app-featured-row />
    </div>

    <section aria-labelledby="categories-heading">
      <h2
        id="categories-heading"
        class="mb-5 text-xl font-medium tracking-tight"
      >
        {{ text.home.categoriesHeading }}
      </h2>
      <app-category-index />
    </section>
  `,
})
export class Home {
  protected readonly text = inject(STOREFRONT_TEXT);
  protected readonly tagline = inject(DEPLOYMENT_CONFIG).branding.tagline;
  /** The band's own margin, so its edge clears the cards. */
  protected readonly band = 'mb-4 ' + BAND;

  constructor() {
    usePageSeo({ name: () => null, description: () => this.text.home.intro });
  }
}
