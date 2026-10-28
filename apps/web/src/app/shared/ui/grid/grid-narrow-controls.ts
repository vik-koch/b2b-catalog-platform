import { Component, computed, inject, input } from '@angular/core';
import { fill } from '../fill';
import { GRID_TEXT } from './grid-text';
import { disclosureState } from '../disclosure-state';
import { DisclosureToggle } from '../disclosure-toggle';
import { DisclosureFrame } from '../disclosure-frame';
import { Input } from '../input';
import { SelectField } from '../select-field';
import { GridClearFilters } from './grid-clear-filters';
import { GridChips } from './grid-chips';
import { GridToggles } from './grid-toggles';
import {
  activeFilterCount,
  filterableColumns,
  filterParams,
  GridChip,
  GridToggleGroup,
  GridColumn,
  sortableColumns,
} from './grid-column';
import { gridParam, injectGridNav } from './grid-nav';

/** One line of the sort picker: a column in one direction. */
interface SortOption {
  value: string;
  label: string;
}

/**
 * The filters and the sort where there are no headings to hold them: one row,
 * a disclosure counting the filters in effect and clear-filters beside it. A
 * disclosure, not a sheet, so the list stays visible while it narrows. It
 * writes the same query parameters as the headings: one URL per view.
 */
@Component({
  selector: 'app-grid-narrow-controls',
  imports: [
    GridChips,
    DisclosureToggle,
    Input,
    SelectField,
    GridClearFilters,
    GridToggles,
    DisclosureFrame,
  ],
  template: `
    @if (anything()) {
      <div class="mb-4 flex items-start gap-2">
        <!-- One bordered box for lid and panel; it grows by a 0fr → 1fr grid
             row, since a height cannot transition to the content's. -->
        <div
          class="min-w-0 flex-1 rounded-md border"
          appDisclosureFrame
          [open]="open()"
        >
          <app-disclosure-toggle
            [label]="gridText.filters"
            [count]="activeCount()"
            [countLabel]="countLabel()"
            [open]="open()"
            [panelId]="panelId"
            (toggled)="disclosure.toggle()"
          />

          <div [class]="panelRow()">
            <div class="overflow-hidden">
              <div
                [id]="panelId"
                class="grid gap-4 border-t border-edge p-4"
                role="group"
                [attr.aria-label]="gridText.filters"
              >
                @if (sortOptions().length) {
                  <label class="block">
                    <span class="mb-1 block text-sm text-ink-subtle">{{
                      gridText.sort
                    }}</span>
                    <app-select-field>
                      <select
                        appInput
                        class="w-full text-sm"
                        (change)="onSort($event)"
                      >
                        <!-- Only for an ordering no column owns, or the picker
                             would claim the first column. -->
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
                    <span class="mb-1 block text-sm text-ink-subtle">{{
                      column.filter?.label
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

                @if (toggles().length) {
                  <app-grid-toggles [groups]="toggles()" />
                }

                @if (chips().length) {
                  <app-grid-chips [chips]="chips()" />
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Beside the box: it also clears the search. Centred on the toggle,
             not the growing box: h-10 is the toggle's height, mt-px the frame's
             border above it. -->
        <div class="mt-px flex h-10 items-center">
          <app-grid-clear-filters [filtered]="filtered()" />
        </div>
      </div>
    }
  `,
})
export class GridNarrowControls {
  private readonly navigate = injectGridNav();
  protected readonly gridText = inject(GRID_TEXT);
  protected readonly panelId = 'grid-filters-panel';

  readonly columns = input.required<readonly GridColumn[]>();
  readonly chips = input<readonly GridChip[]>([]);
  readonly toggles = input<readonly GridToggleGroup[]>([]);
  /** The sort in effect, resolved; null where no column owns it. */
  readonly sort = input.required<string | null>();
  /** The key written as an absent parameter. */
  readonly defaultSort = input('');
  /** What to call the ordering that belongs to no column. */
  readonly defaultSortLabel = input<string>('');
  /** Whether anything narrows the list, the search included. */
  readonly filtered = input(false);

  protected readonly disclosure = disclosureState(200);
  protected readonly open = this.disclosure.open;

  /** Armed by the toggle, so resizing the window does not play the opening. */
  protected readonly panelRow = computed(() => {
    const move = this.disclosure.animated()
      ? 'transition-[grid-template-rows] duration-200 ease-out '
      : '';
    return `grid ${move}${this.open() ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`;
  });

  protected readonly countLabel = computed(() =>
    fill(this.gridText.countSuffix, { count: this.activeCount() }),
  );

  protected readonly filters = computed(() =>
    filterableColumns(this.columns()),
  );
  protected readonly activeCount = computed(() =>
    activeFilterCount(this.columns(), this.chips(), this.toggles()),
  );

  /** No filter and no sort: no row at all. */
  protected readonly anything = computed(
    () => this.filters().length > 0 || this.sortOptions().length > 0,
  );

  /** Every sortable column both ways, the direction in words: an option is
   * read aloud as often as it is seen. */
  protected readonly sortOptions = computed<SortOption[]>(() =>
    sortableColumns(this.columns()).flatMap((column) => {
      const sort = column.sort;
      if (!sort) return [];
      const label = column.sortName ?? column.label ?? column.key;
      const asc = {
        value: sort.asc,
        label: fill(this.gridText.sortAscending, { column: label }),
      };
      const desc = {
        value: sort.desc,
        label: fill(this.gridText.sortDescending, { column: label }),
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
    this.navigate(filterParams(column.filter, value));
  }

  protected indent(depth = 0): string {
    return '   '.repeat(depth);
  }
}
