import { Component, inject } from '@angular/core';
import { CategoryIndex } from '../catalog/category-index';
import { FeaturedRow } from './featured-row';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';

// The storefront landing: a brief intro, a row of products (FR-CAT-09), then
// the categories — the same index /catalog shows (FR-CAT-01).
@Component({
  imports: [CategoryIndex, FeaturedRow],
  selector: 'app-home',
  template: `
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

    <app-category-index />
  `,
})
export class Home {
  protected readonly text = inject(APP_TEXT);

  constructor() {
    // Landing page keeps the bare shop title (name null); adds a description.
    usePageSeo({ name: () => null, description: () => this.text.home.intro });
  }
}
