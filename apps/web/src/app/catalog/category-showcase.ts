import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { CatalogService } from './catalog.service';

/**
 * Home-page category showcase (FR-CAT-01): an editorial, masonry-style set of
 * cards — one per top-level category — each listing all its subcategories as
 * pills. Card height follows its content (image + name + wrapped pills), so a
 * category with many subcategories is naturally taller. Distinct from the dense
 * uniform grid at /catalog, which stays the scannable full index.
 */
@Component({
  selector: 'app-category-showcase',
  imports: [RouterLink],
  template: `
    @if (categories.error()) {
      <p class="text-stone-600">{{ text.loadError }}</p>
    } @else if (categories.value(); as cats) {
      @if (cats.length) {
        <div class="gap-5 columns-2 sm:columns-3 lg:columns-4">
          @for (cat of cats; track cat.slug) {
            <div
              class="mb-5 break-inside-avoid overflow-hidden rounded-xl border border-stone-200 bg-surface"
            >
              <a
                [routerLink]="['/catalog', cat.slug]"
                [attr.aria-label]="viewLabel(cat.name)"
                class="group block"
              >
                @if (cat.image) {
                  <div class="aspect-video overflow-hidden bg-stone-100">
                    <img
                      [src]="cat.image.thumb"
                      alt=""
                      loading="lazy"
                      class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                }
                <h3
                  class="px-4 pt-3 text-base font-semibold tracking-tight group-hover:text-accent"
                >
                  {{ cat.name }}
                </h3>
              </a>
              @if (cat.children.length) {
                <ul class="flex flex-wrap gap-2 px-4 pt-3 pb-4">
                  @for (child of cat.children; track child.slug) {
                    <li>
                      <a
                        [routerLink]="['/catalog', child.slug]"
                        class="inline-block rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700 transition-colors hover:bg-accent hover:text-white"
                      >
                        {{ child.name }}
                      </a>
                    </li>
                  }
                </ul>
              } @else {
                <div class="pb-4"></div>
              }
            </div>
          }
        </div>
      } @else {
        <p class="text-stone-600">{{ text.emptyCategories }}</p>
      }
    } @else {
      <div class="gap-5 columns-2 sm:columns-3 lg:columns-4" aria-hidden="true">
        @for (i of skeletons; track i) {
          <div
            class="mb-5 break-inside-avoid overflow-hidden rounded-xl border border-stone-200"
          >
            <div class="aspect-video animate-pulse bg-stone-200"></div>
            <div class="m-4 h-4 w-2/3 animate-pulse rounded bg-stone-200"></div>
          </div>
        }
      </div>
    }
  `,
})
export class CategoryShowcase {
  private catalog = inject(CatalogService);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly skeletons = Array.from({ length: 6 }, (_, i) => i);

  protected categories = resource({
    loader: () => this.catalog.getCategoryTree(),
  });

  protected viewLabel(name: string): string {
    return this.text.viewCategory.replace('{name}', name);
  }
}
