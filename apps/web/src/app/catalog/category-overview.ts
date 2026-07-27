import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryNode } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { CatalogService } from './catalog.service';

/** How many subcategory links a tile shows before collapsing to "+N". */
const MAX_CHILD_LINKS = 3;

/**
 * The catalogue landing view: a dense, responsive grid of all top-level
 * categories as image tiles, each linking into its product grid, with a few
 * subcategory quick links beneath (FR-CAT-01/02). Two columns on a phone,
 * widening to six on a large screen.
 */
@Component({
  selector: 'app-category-overview',
  imports: [RouterLink],
  template: `
    <section class="py-12 sm:py-16">
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
        {{ text.overviewTitle }}
      </h1>
      <p class="mt-3 max-w-xl text-lg text-stone-600">
        {{ text.overviewIntro }}
      </p>

      @if (categories.error()) {
        <p class="mt-10 text-stone-600">{{ text.loadError }}</p>
      } @else if (categories.value(); as cats) {
        @if (cats.length) {
          <ul
            class="mt-10 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          >
            @for (cat of cats; track cat.slug) {
              <li class="group">
                <a
                  [routerLink]="['/catalog', cat.slug]"
                  [attr.aria-label]="viewCategoryLabel(cat.name)"
                  class="block"
                >
                  <div
                    class="aspect-square overflow-hidden rounded-lg bg-stone-100"
                  >
                    @if (cat.imageUrl) {
                      <img
                        [src]="cat.imageUrl"
                        alt=""
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    }
                  </div>
                  <h2
                    class="mt-2 text-sm font-medium tracking-tight group-hover:text-accent sm:text-base"
                  >
                    {{ cat.name }}
                  </h2>
                </a>
                @if (cat.children.length) {
                  @let preview = childPreview(cat);
                  <ul
                    class="mt-1 hidden flex-wrap gap-x-2 gap-y-0.5 text-xs text-stone-500 sm:flex"
                  >
                    @for (child of preview.shown; track child.slug) {
                      <li>
                        <a
                          [routerLink]="['/catalog', child.slug]"
                          class="hover:text-accent"
                        >
                          {{ child.name }}
                        </a>
                      </li>
                    }
                    @if (preview.extra) {
                      <li class="text-stone-400">+{{ preview.extra }}</li>
                    }
                  </ul>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="mt-10 text-stone-600">{{ text.emptyCategories }}</p>
        }
      } @else {
        <div
          class="mt-10 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          aria-hidden="true"
        >
          @for (i of skeletons; track i) {
            <div>
              <div
                class="aspect-square animate-pulse rounded-lg bg-stone-200"
              ></div>
              <div
                class="mt-2 h-4 w-2/3 animate-pulse rounded bg-stone-200"
              ></div>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class CategoryOverview {
  private catalog = inject(CatalogService);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly skeletons = Array.from({ length: 12 }, (_, i) => i);

  protected categories = resource({
    loader: () => this.catalog.getCategoryTree(),
  });

  protected viewCategoryLabel(name: string): string {
    return this.text.viewCategory.replace('{name}', name);
  }

  /** First few subcategories to show as links, plus how many are hidden. */
  protected childPreview(cat: CategoryNode): {
    shown: CategoryNode[];
    extra: number;
  } {
    return {
      shown: cat.children.slice(0, MAX_CHILD_LINKS),
      extra: Math.max(0, cat.children.length - MAX_CHILD_LINKS),
    };
  }
}
