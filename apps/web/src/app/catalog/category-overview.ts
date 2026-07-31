import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryNode } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { adminText } from '../config/admin-text';
import { usePageSeo } from '../core/page-seo';
import { EditModeService } from '../admin/edit-mode.service';
import { CategoryDeleteDialog } from '../admin/category-delete-dialog';
import { IconButton } from '../ui/icon-button';
import { LucideIcon } from '../ui/icons/lucide-icon';
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
  imports: [
    RouterLink,
    ImagePlaceholder,
    LucideIcon,
    IconButton,
    CategoryDeleteDialog,
  ],
  template: `
    <section class="relative pb-12 sm:pb-16">
      @if (editText(); as editText) {
        <a
          appIconButton
          class="absolute top-0 right-0 z-10"
          [routerLink]="['/admin/categories']"
          [attr.aria-label]="editText.editCategories"
          [attr.title]="editText.editCategories"
        >
          <app-lucide-icon name="pencil" class="h-5 w-5" />
        </a>
      }
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
        {{ text.overviewTitle }}
      </h1>
      <p class="mt-3 max-w-xl text-lg text-muted">
        {{ text.overviewIntro }}
      </p>

      @if (categories.error()) {
        <p class="mt-10 text-muted">{{ text.loadError }}</p>
      } @else if (categories.value(); as cats) {
        @if (cats.length) {
          <ul
            class="mt-10 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            @for (cat of cats; track cat.slug) {
              <li class="group relative">
                @if (editText(); as editText) {
                  <div class="absolute top-2 right-2 z-10 flex gap-1.5">
                    <a
                      appIconButton
                      [routerLink]="['/admin/categories', cat.slug, 'edit']"
                      [attr.aria-label]="editText.editCategory"
                    >
                      <app-lucide-icon name="pencil" class="h-4 w-4" />
                    </a>
                    <button
                      appIconButton
                      variant="danger"
                      type="button"
                      [attr.aria-label]="editText.deleteCategory"
                      (click)="
                        deletingCategory.set({ slug: cat.slug, name: cat.name })
                      "
                    >
                      <app-lucide-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  </div>
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

      @defer (when deletingCategory()) {
        @if (deletingCategory(); as target) {
          <app-category-delete-dialog
            [slug]="target.slug"
            [name]="target.name"
            (deleted)="onCategoryDeleted()"
            (cancelled)="deletingCategory.set(null)"
          />
        }
      }
    </section>
  `,
})
export class CategoryOverview {
  private catalog = inject(CatalogService);
  protected readonly editMode = inject(EditModeService);
  protected readonly text = inject(APP_TEXT).catalog;
  /**
   * Edit-mode wording, non-null only once edit mode is on — which implies the
   * admin text has arrived (see EditModeService). Read as a signal rather than
   * injected, because this component also renders for anonymous visitors, who
   * never fetch that text.
   */
  protected readonly editText = computed(() =>
    this.editMode.enabled() ? (adminText()?.editMode ?? null) : null,
  );
  protected readonly skeletons = Array.from({ length: 12 }, (_, i) => i);
  /** The top-level category whose delete confirmation is open, if any. */
  protected readonly deletingCategory = signal<{
    slug: string;
    name: string;
  } | null>(null);

  protected categories = resource({
    loader: () => this.catalog.getCategoryTree(),
  });

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.categories.isLoading);

  protected onCategoryDeleted(): void {
    this.deletingCategory.set(null);
    this.categories.reload();
  }

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
