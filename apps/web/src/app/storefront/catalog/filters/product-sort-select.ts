import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PRODUCT_SORTS } from '@b2b-catalog-platform/shared/core/catalog';
import { ListingSort } from '@b2b-catalog-platform/shared/storefront/catalog';
import { Segment } from '@b2b-catalog-platform/ui/choices/segment';
import { SegmentGroup } from '@b2b-catalog-platform/ui/choices/segment-group';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { sortParam } from '../listing-params';

/**
 * A listing's sort control (FR-SEARCH-04). Segments above a wide listing, the
 * chosen one turning round on a second press; a native `<select>` below that
 * and inside the filter disclosure. It navigates itself, since sort lives in
 * the URL. A deployment switching it off does so here, so no listing has to
 * remember; the parameter still orders, so shared links keep working.
 */
@Component({
  selector: 'app-product-sort-select',
  imports: [Input, SelectInput, Segment, SegmentGroup],
  template: `
    @if (enabled) {
      @if (shape() === 'segments') {
        <!-- On the figure the layout toggle hides at. -->
        <div
          role="group"
          [attr.aria-label]="text.sort.label"
          class="hidden items-center gap-2 @min-[38rem]/listing:flex"
        >
          <span
            class="text-sm whitespace-nowrap text-ink-subtle"
            aria-hidden="true"
          >
            {{ text.sort.label }}
          </span>
          <div uiSegmentGroup tone="neutral" class="h-8 items-center">
            @for (field of fields(); track field.key) {
              <button
                type="button"
                uiSegment
                [state]="field.active ? 'selected' : 'available'"
                class="flex h-full items-center gap-1 px-2.5 whitespace-nowrap"
                [attr.aria-pressed]="field.active"
                [attr.aria-label]="text.sort[field.shows]"
                [title]="text.sort[field.shows]"
                (click)="press(field.key)"
              >
                {{ text.sort.fields[field.key] }}
                @if (field.arrow) {
                  <span
                    aria-hidden="true"
                    [class]="field.active ? '' : 'text-ink-subtle'"
                    >{{ field.arrow }}</span
                  >
                }
              </button>
            }
          </div>
        </div>
      }
      <div [class]="selectRow()">
        <label
          [attr.for]="fieldId()"
          class="text-sm whitespace-nowrap text-ink-subtle"
          >{{ text.sort.label }}</label
        >
        <ui-select-input class="max-w-52">
          <!-- Marked on the option: a value binding on the <select> runs
               before the options exist. Attribute for the server's HTML,
               property for a later back/forward, which a dirty select
               ignores the attribute for. -->
          <select
            uiInput
            size="sm"
            [id]="fieldId()"
            (change)="onSelect($event)"
            class="w-full"
          >
            @for (option of options(); track option) {
              <option
                [value]="option"
                [selected]="option === value()"
                [attr.selected]="option === value() ? '' : null"
              >
                {{ text.sort[option] }}
              </option>
            }
          </select>
        </ui-select-input>
      </div>
    }
  `,
})
export class ProductSortSelect {
  protected readonly enabled =
    inject(DEPLOYMENT_CONFIG).catalog.sortControlsEnabled;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(STOREFRONT_TEXT).catalog;
  /** A constant, so server and browser agree; the filter panel's copy passes
   * its own. */
  readonly fieldId = input('product-sort');

  /** Resolved to a valid key by the host. */
  readonly value = input.required<ListingSort>();
  readonly options = input<readonly ListingSort[]>(PRODUCT_SORTS);
  readonly defaultSort = input.required<ListingSort>();
  readonly shape = input<'segments' | 'select'>('select');

  protected readonly selectRow = computed(
    () =>
      `flex items-center gap-2${this.shape() === 'segments' ? ' @min-[38rem]/listing:hidden' : ''}`,
  );

  /** A field offered both ways is one segment with an arrow; `shows` is the
   * order it stands for, whose wording is its accessible name. */
  protected readonly fields = computed(() => {
    const options = this.options();
    const value = this.value();
    const seen = new Set<SortField>();
    return options.flatMap((option) => {
      const key = sortField(option);
      if (seen.has(key)) return [];
      seen.add(key);
      const turns = options.includes(`${key}_desc` as ListingSort);
      const active = sortField(value) === key;
      const shows: ListingSort = active ? value : (key as ListingSort);
      const arrow = turns ? (shows.endsWith('_desc') ? '↓' : '↑') : '';
      return [{ key, active, shows, arrow }];
    });
  });

  protected press(key: SortField): void {
    const current = this.value();
    const turns = this.options().includes(`${key}_desc` as ListingSort);
    if (sortField(current) !== key) {
      this.navigate(key as ListingSort);
    } else if (turns) {
      this.navigate(
        (current.endsWith('_desc') ? key : `${key}_desc`) as ListingSort,
      );
    }
  }

  protected onSelect(event: Event): void {
    this.navigate((event.target as HTMLSelectElement).value as ListingSort);
  }

  /** `page` is dropped: it points at nothing in the new order. */
  private navigate(sort: ListingSort): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sortParam(sort, this.defaultSort()), page: null },
      queryParamsHandling: 'merge',
    });
  }
}

/** What a sort orders by, whichever way round. */
type SortField = 'relevance' | 'category' | 'name' | 'price';

function sortField(sort: ListingSort): SortField {
  return sort.replace(/_desc$/, '') as SortField;
}
