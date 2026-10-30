import {
  CdkDrag,
  CdkDragDrop,
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
import {
  CatalogFilters,
  CategoryFilter,
  CategoryFilters,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';

import { usePageSeo } from '../../../shared/core/page-seo';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { injectEditorReturn } from '../../../shared/edit-mode/editor-return';
import { UnpublishedCount } from '../products/unpublished-count';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { AttributesService } from './attributes.service';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { DragGrip } from '../ui/drag-grip';
import { SaveButton } from '../../ui/save-button';
import { CancelButton } from '../../ui/cancel-button';

/** Where the panel closes to when it was not opened from in the app. */
const FALLBACK_RETURN = '/admin/categories';

type Panel = CategoryFilters | CatalogFilters;

function isCategoryPanel(panel: Panel): panel is CategoryFilters {
  return 'category' in panel;
}

/**
 * A category's filter panel (FR-ATTR-11), or without one the whole catalogue's
 * (FR-ATTR-12). Every definition is listed, so one can be placed before any
 * product carries it. Order and ticks are one draft and one save, unlike the
 * attribute list's drag-to-commit: saving is when a category stops following
 * its parent. Save and cancel close back to where the panel was opened;
 * reset stays, since its result is what the screen shows next.
 */
@Component({
  selector: 'app-category-filters-page',
  imports: [
    CancelButton,
    SaveButton,
    DragGrip,
    RouterLink,
    CdkDropList,
    CdkDrag,
    Button,
    Checkbox,
    IconButton,
    Icon,
    RecordRow,
    Skeleton,
    Link,
    UnpublishedCount,
    PageTitle,
    ErrorText,
  ],
  template: `
    <div class="mb-4 flex items-start justify-between gap-4">
      <!-- The heading names the category, so it waits for it behind a bar. -->
      @if (loaded(); as panel) {
        <h1 uiPageTitle>
          {{ headingFor(panel) }}
        </h1>
      } @else {
        <ui-skeleton size="title" class="w-2/3 max-w-sm" [widths]="['100%']" />
      }
      <a uiButton variant="secondary" routerLink="/admin/attributes">
        {{ text.page.title }}
      </a>
    </div>

    @if (slug() ? text.page.intro : text.catalogIntro; as intro) {
      <p class="mb-2 max-w-3xl text-sm text-ink-subtle">{{ intro }}</p>
    }

    <div class="max-w-3xl">
      @if (filters.error()) {
        <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
      } @else if (filters.hasValue()) {
        @if (loaded(); as panel) {
          <!-- The one line that tells an inherited panel from an owned one. -->
          @if (sourceLabel(panel); as source) {
            <p class="mb-6 text-sm text-ink-subtle">{{ source }}</p>
          } @else {
            <div class="mb-6"></div>
          }

          @if (draft().length === 0) {
            <p class="text-sm text-ink-subtle">{{ text.noDefinitions }}</p>
          } @else {
            <div class="border-y border-edge">
              <ul
                class="divide-y divide-edge"
                cdkDropList
                [cdkDropListDisabled]="busy()"
                (cdkDropListDropped)="onDrop($event)"
              >
                @for (filter of draft(); track filter.attributeId) {
                  <li class="py-3" cdkDrag>
                    <ui-record-row>
                      <input
                        recordControl
                        type="checkbox"
                        uiCheckbox
                        class="self-center"
                        [checked]="filter.visible"
                        [attr.aria-label]="filter.name"
                        [title]="text.show"
                        (change)="toggle(filter)"
                      />
                      <span class="font-medium text-ink">
                        {{ filter.name }}
                      </span>
                      <ng-container recordMeta>
                        @if (filter.productCount === 0) {
                          <span>{{ text.notPresent }}</span>
                        } @else {
                          <a
                            uiLink
                            routerLink="/admin/products"
                            [queryParams]="{
                              categoryId: categoryIdOf(panel),
                              attributeKey: filter.name,
                            }"
                          >
                            {{ productsLabel(filter.productCount) }}
                          </a>
                          <app-unpublished-count
                            [count]="filter.unpublishedProductCount"
                            [query]="{
                              categoryId: categoryIdOf(panel),
                              attributeKey: filter.name,
                            }"
                          />
                        }
                        @if (filter.isNew) {
                          <span class="text-warning">{{ text.isNew }}</span>
                        }
                      </ng-container>
                      <app-drag-grip recordActions [label]="text.reorder" />
                    </ui-record-row>
                  </li>
                }
              </ul>
            </div>

            @if (noneVisible()) {
              <p class="mt-4 text-sm text-warning">
                {{ slug() ? text.empty : text.catalogEmpty }}
              </p>
            }

            <div class="mt-6 flex flex-wrap items-center gap-3">
              <button
                uiButton
                appSaveButton
                type="button"
                [saving]="busy()"
                (click)="save()"
              >
                {{ text.save }}
              </button>
              <button
                uiButton
                variant="secondary"
                appCancelButton
                type="button"
                [disabled]="busy()"
                (click)="cancel()"
              >
                {{ actionText.cancel }}
              </button>
              @if (isCategoryPanel(panel) && panel.source === 'own') {
                <button
                  uiButton
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
              <p class="mt-4 text-sm text-ink" role="status">
                {{ text.resetDone }}
              </p>
            }
            @if (error()) {
              <p uiErrorText class="mt-4" role="alert">
                {{ error() }}
              </p>
            }
          }
        } @else {
          <p class="text-ink-subtle" role="alert">
            {{ notFound() }}
          </p>
        }
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="4" />
      }
    </div>
  `,
})
export class CategoryFiltersPage {
  private readonly service = inject(AttributesService);
  private readonly confirm = inject(ConfirmService);
  private readonly returnTo = injectEditorReturn();
  protected readonly text = inject(ADMIN_TEXT).categories.filters;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;

  /** Absent for the whole catalogue's panel. */
  readonly slug = input<string>();

  protected readonly isCategoryPanel = isCategoryPanel;

  protected readonly filters = resource<Panel | null, { slug?: string }>({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) =>
      params.slug
        ? this.service.categoryFilters(params.slug)
        : this.service.catalogFilters(),
  });
  protected readonly showSkeleton = delayedLoading(this.filters.isLoading);
  /** Null where the slug names no category: the resource itself succeeded. */
  protected readonly loaded = computed(() => this.filters.value() ?? null);

  /** Seeded from the resolved panel, inherited or not: editing an inherited
   * list is how a category gets its own. */
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
    usePageSeo({
      name: () => {
        const panel = this.loaded();
        return panel && isCategoryPanel(panel)
          ? panel.category.name
          : this.text.page.title;
      },
    });
  }

  protected headingFor(panel: Panel): string {
    return isCategoryPanel(panel)
      ? fillText(this.text.heading, { category: panel.category.name })
      : this.text.catalogHeading;
  }

  /** The category is gone, or for the whole catalogue one of the attributes. */
  protected notFound(): string {
    return this.slug()
      ? this.text.errors['category-not-found']
      : this.text.errors['attribute-not-found'];
  }

  protected cancel(): void {
    void this.returnTo(FALLBACK_RETURN);
  }

  /** Null for the whole catalogue, whose list comes from nowhere else. */
  protected sourceLabel(panel: Panel): string | null {
    if (!isCategoryPanel(panel)) return null;
    return fillText(this.text.sources[panel.source], {
      category: panel.inheritedFrom?.name ?? '',
    });
  }

  /** Null drops the parameter from a count's link. */
  protected categoryIdOf(panel: Panel): string | null {
    return isCategoryPanel(panel) ? panel.category.id : null;
  }

  protected productsLabel(count: number): string {
    return fillText(this.text.products, { count });
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

  /** Every edit clears the last outcome: it no longer describes this list. */
  private edit(change: (list: CategoryFilter[]) => CategoryFilter[]): void {
    this.wasReset.set(false);
    this.error.set(null);
    this.edited.set(change(this.draft()));
  }

  protected async save(): Promise<void> {
    const list = this.draft();
    this.busy.set(true);
    this.error.set(null);
    const body = {
      filters: list.map((filter) => ({
        attributeId: filter.attributeId,
        visible: filter.visible,
      })),
    };
    const slug = this.slug();
    try {
      const panel = slug
        ? await this.service.saveCategoryFilters(slug, body)
        : await this.service.saveCatalogFilters(body);
      if (!panel) {
        this.error.set(this.notFound());
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

  /** Confirmed, unlike a save: it also changes every subcategory following
   * this one, which this screen does not show. */
  protected async reset(): Promise<void> {
    const slug = this.slug();
    if (!slug) return;
    const ok = await this.confirm.ask({
      heading: this.text.resetConfirm.heading,
      message: this.text.resetConfirm.message,
      confirmLabel: this.text.resetConfirm.confirm,
      cancelLabel: this.text.resetConfirm.cancel ?? this.actionText.cancel,
    });
    if (!ok) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const panel = await this.service.resetCategoryFilters(slug);
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
