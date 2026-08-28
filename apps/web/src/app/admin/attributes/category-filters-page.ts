import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryFilter, CategoryFilters } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { ConfirmService } from '../../ui/confirm.service';
import { injectEditorReturn } from '../editor-return';
import { AttributesService } from './attributes.service';

/** Where the panel closes to when it was not opened from anywhere in-app. */
const FALLBACK_RETURN = '/admin/categories';

/**
 * One category's filter panel (FR-ATTR-11) — which filterable attributes it
 * offers, and in what order.
 *
 * Every definition is listed, offered or not: an attribute has to be placeable
 * before any product carries it, and one declared after this panel was saved
 * would otherwise be missing with nothing to say so. The product count carries
 * the judgement — an attribute no product here carries renders no facet
 * whatever this screen says, so the rows worth touching are the ones with a
 * count.
 *
 * Order and the checkboxes are one draft and one save, unlike the registry's
 * drag-to-commit: saving here is not a reorder, it is the moment a category
 * stops following its parent. Saving and cancelling both close the panel back
 * to wherever it was opened from — the storefront grid as often as the admin
 * list. Resetting to the inherited list does not: it is an edit to this
 * screen's own subject, and the result is what the screen then shows.
 */
@Component({
  selector: 'app-category-filters-page',
  imports: [
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Button,
    Checkbox,
    AdminIcon,
    Skeleton,
  ],
  template: `
    <div class="mb-4 flex items-center justify-between gap-4">
      <!-- The category is in the heading, so the heading waits for it: drawing
           "Filters" first and growing it into "Filters in Coffee" a moment
           later reads as the page changing its mind. A bar of the same height
           holds the row instead. -->
      @if (loaded(); as panel) {
        <h1 class="text-3xl font-bold tracking-tight">
          {{ headingFor(panel) }}
        </h1>
      } @else {
        <div
          class="h-9 w-2/3 max-w-sm animate-pulse rounded bg-stone-200"
          aria-hidden="true"
        ></div>
      }
      <a appButton variant="secondary" routerLink="/admin/attributes">
        {{ text.title }}
      </a>
    </div>

    <p class="mb-2 max-w-3xl text-sm text-muted">{{ text.intro }}</p>

    <div class="max-w-3xl">
      @if (filters.error()) {
        <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
      } @else if (filters.hasValue()) {
        @if (loaded(); as panel) {
          <!-- Where the list comes from is the first thing to read: an
               inherited panel looks identical to an owned one until it is
               saved, and only this line tells them apart. -->
          <p class="mb-6 text-sm text-subtle">{{ sourceLabel(panel) }}</p>

          @if (draft().length === 0) {
            <p class="text-sm text-muted">{{ text.noDefinitions }}</p>
          } @else {
            <div class="overflow-hidden rounded-lg border border-border">
              <ul
                class="divide-y divide-border"
                cdkDropList
                [cdkDropListDisabled]="busy()"
                (cdkDropListDropped)="onDrop($event)"
              >
                @for (filter of draft(); track filter.attributeId) {
                  <li class="flex items-center gap-3 bg-white p-4" cdkDrag>
                    <label class="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        appCheckbox
                        [checked]="filter.visible"
                        [attr.aria-label]="text.show"
                        (change)="toggle(filter)"
                      />
                      <span class="font-medium text-stone-700">
                        {{ filter.name }}
                      </span>
                    </label>
                    <span class="text-sm text-subtle">
                      @if (filter.productCount === 0) {
                        {{ text.notPresent }}
                      } @else {
                        {{ productsLabel(filter.productCount) }}
                      }
                    </span>
                    @if (filter.isNew) {
                      <span class="text-sm text-amber-700">
                        {{ text.isNew }}
                      </span>
                    }
                    <span
                      cdkDragHandle
                      class="ml-auto cursor-grab p-1 text-stone-300 hover:text-subtle active:cursor-grabbing"
                      [attr.aria-label]="text.reorder"
                      [title]="text.reorder"
                    >
                      <app-admin-icon name="grip-vertical" class="h-4 w-4" />
                    </span>
                  </li>
                }
              </ul>
            </div>

            @if (noneVisible()) {
              <p class="mt-4 text-sm text-amber-700">{{ text.empty }}</p>
            }

            <div class="mt-6 flex items-center gap-2">
              <button
                appButton
                type="button"
                class="gap-2"
                [disabled]="busy()"
                (click)="save()"
              >
                <app-admin-icon name="save" class="h-4 w-4" />
                {{ busy() ? common.saving : text.save }}
              </button>
              <button
                appButton
                variant="secondary"
                type="button"
                class="gap-2"
                [disabled]="busy()"
                (click)="cancel()"
              >
                <app-admin-icon name="x" class="h-4 w-4" />
                {{ common.cancel }}
              </button>
              @if (panel.source === 'own') {
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  [disabled]="busy()"
                  (click)="reset()"
                >
                  {{ text.reset }}
                </button>
              }
            </div>

            @if (wasReset()) {
              <p class="mt-4 text-sm text-stone-700" role="status">
                {{ text.resetDone }}
              </p>
            }
            @if (error()) {
              <p class="mt-4 text-sm text-red-700" role="alert">
                {{ error() }}
              </p>
            }
          }
        } @else {
          <p class="text-muted" role="alert">
            {{ text.errors['category-not-found'] }}
          </p>
        }
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    </div>
  `,
})
export class CategoryFiltersPage {
  private readonly service = inject(AttributesService);
  private readonly confirm = inject(ConfirmService);
  /** Back where the panel was opened from — the grid, or the category list. */
  private readonly returnTo = injectEditorReturn();
  protected readonly text = inject(ADMIN_TEXT).categoryFilters;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  /** The category being edited, from the route. */
  readonly slug = input.required<string>();

  protected readonly filters = resource({
    params: () => this.slug(),
    loader: ({ params }) => this.service.categoryFilters(params),
  });
  protected readonly showSkeleton = delayedLoading(this.filters.isLoading);
  /** Null where the slug names no category — the resource itself succeeded. */
  protected readonly loaded = computed(() => this.filters.value() ?? null);

  /**
   * The edited list. Seeded from whatever the server resolved, inherited panel
   * included: editing an inherited list is how a category is given its own.
   */
  private readonly edited = signal<CategoryFilter[] | null>(null);
  private readonly loadedFilters = computed(() => this.loaded()?.filters ?? []);
  protected readonly draft = computed(
    () => this.edited() ?? this.loadedFilters(),
  );
  protected readonly noneVisible = computed(
    () =>
      this.draft().length > 0 &&
      this.draft().every((filter) => !filter.visible),
  );

  protected readonly busy = signal(false);
  /** Set by a reset alone: a save leaves the screen, so it has nothing to say. */
  protected readonly wasReset = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    usePageSeo({ name: () => this.loaded()?.category.name ?? this.text.title });
  }

  protected headingFor(panel: CategoryFilters): string {
    return this.text.heading.replace('{category}', panel.category.name);
  }

  /** Leaves without saving. Same target as a save, so both close the same way. */
  protected cancel(): void {
    void this.returnTo(FALLBACK_RETURN);
  }

  protected sourceLabel(panel: CategoryFilters): string {
    return this.text.sources[panel.source].replace(
      '{category}',
      panel.inheritedFrom?.name ?? '',
    );
  }

  protected productsLabel(count: number): string {
    return this.text.products.replace('{count}', String(count));
  }

  protected toggle(filter: CategoryFilter): void {
    this.edit((list) =>
      list.map((entry) =>
        entry.attributeId === filter.attributeId
          ? { ...entry, visible: !entry.visible }
          : entry,
      ),
    );
  }

  protected onDrop(event: CdkDragDrop<CategoryFilter>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.edit((list) => {
      const ordered = [...list];
      moveItemInArray(ordered, event.previousIndex, event.currentIndex);
      return ordered;
    });
  }

  /** Every edit clears the last save's outcome: it no longer describes this list. */
  private edit(change: (list: CategoryFilter[]) => CategoryFilter[]): void {
    this.wasReset.set(false);
    this.error.set(null);
    this.edited.set(change(this.draft()));
  }

  protected async save(): Promise<void> {
    const list = this.draft();
    this.busy.set(true);
    this.error.set(null);
    try {
      const panel = await this.service.saveCategoryFilters(this.slug(), {
        filters: list.map((filter) => ({
          attributeId: filter.attributeId,
          visible: filter.visible,
        })),
      });
      if (!panel) {
        this.error.set(this.text.errors['category-not-found']);
        return;
      }
      this.edited.set(null);
      this.filters.set(panel);
      await this.returnTo(FALLBACK_RETURN);
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Confirmed, unlike a save: dropping the overlay also changes every
   * subcategory that was following this one, which is not visible from here.
   */
  protected async reset(): Promise<void> {
    const ok = await this.confirm.ask({
      heading: this.text.resetTitle,
      message: this.text.resetConfirm,
      confirmLabel: this.text.reset,
      cancelLabel: this.common.cancel,
    });
    if (!ok) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const panel = await this.service.resetCategoryFilters(this.slug());
      if (!panel) {
        this.error.set(this.text.errors['category-not-found']);
        return;
      }
      this.edited.set(null);
      this.filters.set(panel);
      this.wasReset.set(true);
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.busy.set(false);
    }
  }
}
