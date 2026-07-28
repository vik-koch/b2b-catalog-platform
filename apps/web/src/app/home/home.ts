import { Component, inject } from '@angular/core';
import { CategoryShowcase } from '../catalog/category-showcase';
import { APP_TEXT } from '../config/app-text';

// The storefront landing (FR-CAT-01): a brief intro, then the category
// showcase. The dense full index lives at /catalog.
@Component({
  imports: [CategoryShowcase],
  selector: 'app-home',
  template: `
    <section class="pb-10">
      <p class="text-sm font-medium tracking-widest text-accent uppercase">
        {{ text.home.eyebrow }}
      </p>
      <h1 class="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        {{ text.home.title }}
      </h1>
      <p class="mt-4 max-w-xl text-lg text-stone-600">
        {{ text.home.intro }}
      </p>
    </section>

    <app-category-showcase />
  `,
})
export class Home {
  protected readonly text = inject(APP_TEXT);
}
