import { Component, inject } from '@angular/core';
import { CategoryIndex } from '../catalog/category-index';
import { FeaturedRow } from './featured-row';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';

/**
 * The white band the intro and the row stand on, from the top of the page to
 * a soft edge under the row, out to both edges of the window. Painted as a
 * border image pushed out past the element rather than by widening it:
 * anything sized to the viewport counts the scrollbar, and the page would
 * scroll sideways by its width. The outset is paint, not layout; its top
 * reaches over the page's own padding to meet the header.
 */
const BAND =
  'bg-white [border-image:linear-gradient(#fff,#fff_calc(100%_-_5px),#f7f7f7)_fill_0/1/1rem_100vmax_0]';

// The storefront landing in two parts: a brief intro and a row of products
// (FR-CAT-09) on a white band, then the categories — the same index /catalog
// shows (FR-CAT-01).
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
          class="mt-3 max-w-2xl text-3xl font-medium tracking-tight sm:text-5xl"
        >
          {{ text.home.title }}
        </h1>
        <p class="mt-4 max-w-xl text-lg text-muted">
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
  protected readonly text = inject(APP_TEXT);
  /** The room under the row is the band's, so the edge sits clear of the
   * cards and the categories start below it. */
  protected readonly band = 'mb-4 ' + BAND;

  constructor() {
    // Landing page keeps the bare shop title (name null); adds a description.
    usePageSeo({ name: () => null, description: () => this.text.home.intro });
  }
}
