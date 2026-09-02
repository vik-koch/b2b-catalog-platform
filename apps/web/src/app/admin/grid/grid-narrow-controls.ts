import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DisclosureToggle } from '../../ui/disclosure-toggle';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { SelectField } from '../../ui/select-field';
import { GridClearFilters } from './grid-clear-filters';
import {
  activeFilterCount,
  filterableColumns,
  GridChip,
  GridColumn,
  sortableColumns,
} from './grid-column';
import { DEFAULT_ADMIN_SORT, gridParam, injectGridNav } from './grid-query';

/** One line of the sort picker: a column in one direction. */
interface SortOption {
  value: string;
  label: string;
}

/**
 * The filters and the sort, for a screen with no table to hang them on.
 *
 * On a desktop both live in the column heading they belong to, which is where a
 * table's controls belong. A phone has no headings — the grid is a list of
 * records there — and the controls used to disappear with them, which made the
 * two questions a manager opens these lists with ("what is still unanswered?",
 * "where is the one they are asking about?") unanswerable on the device they
 * are usually asked from.
 *
 * So the same columns are drawn a second way, and in **one row**: a disclosure
 * carrying how many filters are in effect, and the way back to the whole list
 * beside it. Everything it opens — the sort, every column filter, and the
 * filters that never had a column — is inside the panel, so narrowing the list
 * costs one line of a screen that has few to spare.
 *
 * A disclosure rather than a modal sheet, matching the storefront's facet panel:
 * a filter is chosen while looking at what it did to the list, and a sheet over
 * the rows hides exactly that.
 *
 * Everything here writes the same query parameters the headings do, so a view
 * narrowed on a phone is the same URL as one narrowed at a desk.
 */
@Component({
  selector: 'app-grid-narrow-controls',
  imports: [
    RouterLink,
    AdminIcon,
    DisclosureToggle,
    IconButton,
    Input,
    SelectField,
    GridClearFilters,
  ],
  template: `
    @if (anything()) {
      <div class="mb-4 flex items-start gap-2">
        <!-- One box: the lid and everything it opens share a border, so it is
             visible which fields belong to it. It grows and shrinks rather than
             appearing, which is what says the two are one thing — a grid whose
             single row goes from 0fr to 1fr, since a height cannot be
             transitioned to "as tall as the content". -->
        <div
          class="min-w-0 flex-1 rounded-md border transition-colors"
          [class]="open() ? 'border-accent' : 'border-border-strong'"
        >
          <app-disclosure-toggle
            [label]="common.filters"
            [count]="activeCount()"
            [countLabel]="countLabel()"
            [open]="open()"
            [panelId]="panelId"
            (toggled)="open.set(!open())"
          />

          <div
            class="grid transition-[grid-template-rows] duration-200 ease-out"
            [class]="open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
          >
            <div class="overflow-hidden">
              <div
                [id]="panelId"
                class="grid gap-4 border-t border-border px-4 py-4"
                role="group"
                [attr.aria-label]="common.filters"
              >
                @if (sortOptions().length) {
                  <label class="block">
                    <span class="mb-1 block text-sm text-subtle">{{
                      common.sortLabel
                    }}</span>
                    <app-select-field>
                      <select
                        appInput
                        class="w-full text-sm"
                        (change)="onSort($event)"
                      >
                        <!-- Only where the ordering in effect belongs to no
                             column — the product grid's relevance ranking — so
                             the picker never silently claims the list is
                             sorted by its first column. -->
                        @if (unsorted()) {
                          <option value="" selected>
                            {{ defaultSortLabel() }}
                          </option>
                        }
                        @for (option of sortOptions(); track option.value) {
                          <option
                            [value]="option.value"
                            [selected]="option.value === sort()"
                            [attr.selected]="
                              option.value === sort() ? '' : null
                            "
                          >
                            {{ option.label }}
                          </option>
                        }
                      </select>
                    </app-select-field>
                  </label>
                }

                @for (column of filters(); track column.key) {
                  <label class="block">
                    <span class="mb-1 block text-sm text-subtle">{{
                      column.filter?.ariaLabel
                    }}</span>
                    <app-select-field>
                      <select
                        appInput
                        class="w-full text-sm"
                        (change)="onFilter(column, $event)"
                      >
                        @for (
                          option of column.filter?.options ?? [];
                          track option
                        ) {
                          <option
                            [value]="option.value"
                            [selected]="option.value === column.filter?.value"
                            [attr.selected]="
                              option.value === column.filter?.value ? '' : null
                            "
                          >
                            {{ indent(option.depth) }}{{ option.label }}
                          </option>
                        }
                      </select>
                    </app-select-field>
                  </label>
                }

                <!-- The narrowings with no column of their own, arrived at from
                     the screen that asks the question — the attribute
                     inventory, the tier list. They are counted with the rest,
                     and each carries its own way out. -->
                @if (chips().length) {
                  <ul class="flex flex-wrap gap-2">
                    @for (chip of chips(); track chip.label) {
                      <li
                        class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-sm"
                      >
                        <span class="text-subtle">{{ chip.label }}</span>
                        <span class="font-medium">{{ chip.value }}</span>
                        <a
                          appIconButton
                          variant="danger"
                          routerLink="."
                          [queryParams]="chip.clearParams"
                          queryParamsHandling="merge"
                          [attr.aria-label]="chip.clearLabel"
                        >
                          <app-admin-icon name="x" />
                        </a>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Beside the box rather than inside it: it undoes what the box holds
             and the search box above, so it belongs to neither. -->
        <app-grid-clear-filters class="mt-1" [filtered]="filtered()" />
      </div>
    }
  `,
})
export class GridNarrowControls {
  private readonly navigate = injectGridNav();
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly panelId = 'grid-filters-panel';

  readonly columns = input.required<readonly GridColumn[]>();
  readonly chips = input<readonly GridChip[]>([]);
  /** The sort in effect, already resolved — null where no column owns it. */
  readonly sort = input.required<string | null>();
  /** The key written as an absent parameter. */
  readonly defaultSort = input<string>(DEFAULT_ADMIN_SORT);
  /** What to call the ordering that belongs to no column. */
  readonly defaultSortLabel = input<string>('');
  /** Whether anything at all — including the search box — narrows the list. */
  readonly filtered = input(false);

  protected readonly open = signal(false);

  /** The count as the deployment words it — parentheses, as the storefront's
   * facet panel has always shown it. */
  protected readonly countLabel = computed(() =>
    fillText(this.common.filtersCount, { count: this.activeCount() }),
  );

  protected readonly filters = computed(() =>
    filterableColumns(this.columns()),
  );
  protected readonly activeCount = computed(() =>
    activeFilterCount(this.columns(), this.chips()),
  );

  /** Nothing to open and nothing to clear means no row at all: the sync
   * history has neither a filter nor a sort. */
  protected readonly anything = computed(
    () => this.filters().length > 0 || this.sortOptions().length > 0,
  );

  /** Every sortable column in both directions, named as the heading names it.
   * The direction is spelled out rather than drawn as an arrow: this is a
   * `<select>`, and an option is read aloud as often as it is looked at. */
  protected readonly sortOptions = computed<SortOption[]>(() =>
    sortableColumns(this.columns()).flatMap((column) => {
      const sort = column.sort;
      if (!sort) return [];
      const label = column.sortName ?? column.label ?? column.key;
      const asc = {
        value: sort.asc,
        label: fillText(this.common.sortAscending, { column: label }),
      };
      const desc = {
        value: sort.desc,
        label: fillText(this.common.sortDescending, { column: label }),
      };
      return sort.descFirst ? [desc, asc] : [asc, desc];
    }),
  );

  protected readonly unsorted = computed(
    () => !this.sortOptions().some((option) => option.value === this.sort()),
  );

  protected onSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({
      sort: value ? gridParam(value, this.defaultSort()) : null,
    });
  }

  protected onFilter(column: GridColumn, event: Event): void {
    if (!column.filter) return;
    const value = (event.target as HTMLSelectElement).value;
    this.navigate({ [column.filter.param]: value || null });
  }

  protected indent(depth = 0): string {
    return '   '.repeat(depth);
  }
}
