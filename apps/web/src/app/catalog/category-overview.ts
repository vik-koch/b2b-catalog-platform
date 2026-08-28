import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryDisplayName,
  CategoryNode,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { LoadErrorView } from '../pages/load-error-view';
import { injectEditorReturnParams } from '../admin/editor-return';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditActions } from '../admin/edit-actions';
import { usePageSeo } from '../core/page-seo';
import { CatalogService } from './catalog.service';
import { ImagePlaceholder } from './image-placeholder';

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
  imports: [RouterLink, ImagePlaceholder, EditActions, LoadErrorView],
  template: `
    <section class="relative pb-12 sm:pb-16">
      @if (editControls(); as editText) {
        <app-edit-actions
          [editLink]="['/admin/categories']"
          [editLabel]="editText.editCategories"
          [addCategoryLink]="['/admin/categories/new']"
          [addCategoryParams]="editorFrom()"
          [addCategoryLabel]="editText.addCategory"
        />
      }
      <h1 class="text-3xl font-medium tracking-tight sm:text-4xl">
        {{ text.overviewTitle }}
      </h1>
      <p class="mt-3 max-w-xl text-lg text-muted">
        {{ text.overviewIntro }}
      </p>

      @if (categories.error()) {
        <app-load-error-view class="mt-10 block" [message]="text.loadError" />
      } @else if (shown(); as cats) {
        @if (cats.length) {
          <ul
            class="mt-10 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            @for (cat of cats; track cat.slug) {
              <li class="group relative">
                @if (editControls(); as editText) {
                  <app-edit-actions
                    variant="tile"
                    [editLink]="['/admin/categories', cat.slug, 'edit']"
                    [editParams]="editorFrom()"
                    [editLabel]="editText.editCategory"
                  />
                }
                <a
                  [routerLink]="['/catalog', cat.slug]"
                  [attr.aria-label]="viewCategoryLabel(cat.name)"
                  class="block"
                >
                  <div
                    class="aspect-square overflow-hidden rounded-lg bg-stone-100"
                  >
                    @if (cat.image && !failed().has(cat.image.thumb)) {
                      <img
                        [src]="cat.image.thumb"
                        [alt]="cat.name"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        (error)="markFailed(cat.image.thumb)"
                      />
                    } @else {
                      <app-image-placeholder [label]="cat.name" />
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
                    class="mt-1 hidden flex-wrap gap-x-2 gap-y-0.5 text-xs text-subtle sm:flex"
                  >
                    @for (child of preview.shown; track child.slug) {
                      <li>
                        <a
                          [routerLink]="['/catalog', child.slug]"
                          class="hover:text-accent"
                        >
                          {{ displayName(child) }}
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
          <p class="mt-10 text-muted">{{ text.emptyCategories }}</p>
        }
      } @else if (showSkeleton()) {
        <div
          class="mt-10 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
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
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly skeletons = Array.from({ length: 12 }, (_, i) => i);
  /** The quick links sit under their parent tile, so they may use the short
   * name; the tile heading stays the full one. */
  protected readonly displayName = categoryDisplayName;
  /** The top-level category whose delete confirmation is open, if any. */

  protected categories = resource({
    loader: () => this.catalog.getCategoryTree(),
  });

  /** The tiles and the edit affordances appear together, once the tree and the
   * visitor's role are both known — see editAwareContent. */
  private readonly content = editAwareContent({
    ready: computed(() => this.categories.hasValue()),
    section: 'editMode',
  });
  protected readonly editControls = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;
  /** The tree, once it may be shown. */
  protected readonly shown = computed(() =>
    this.content.ready() ? this.categories.value() : undefined,
  );

  constructor() {
    usePageSeo({
      name: () => this.text.overviewTitle,
      description: () => this.text.overviewIntro,
    });
  }

  /** Category image URLs that failed to load — shown as the placeholder instead
   * of the browser's broken-image icon. Keyed by URL. */
  protected readonly failed = signal(new Set<string>());

  protected markFailed(src: string): void {
    this.failed.update((set) => new Set(set).add(src));
  }

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
