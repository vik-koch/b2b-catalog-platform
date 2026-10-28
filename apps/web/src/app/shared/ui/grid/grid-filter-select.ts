import { Component, input } from '@angular/core';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { filterParams, GridFilter } from './grid-column';
import { injectGridNav } from './grid-nav';

export interface GridFilterOption {
  /** The URL value; the empty string means "no filter" and is left out. */
  value: string;
  label: string;
  /** Tree depth, for indented options. */
  depth?: number;
}

/**
 * A column heading's filter (FR-ADM-05): a native `<select>`, styled to
 * heading weight until hovered or focused, writing its own query parameter.
 * Its hover padding is pulled back on the left, so the text lines up with the
 * column's values.
 */
@Component({
  selector: 'app-grid-filter-select',
  imports: [SelectInput],
  template: `
    <!-- The wrapper is w-full, not content-sized: the select inside is w-full,
         so a shrink-to-fit box is not what the chevron should be measured
         against — it ended up hugging the right edge instead of sitting in the
         padding the select reserves for it.

         Deliberately not an appInput field: a column filter is styled to read
         as a heading, so it brings its own weightless look and only borrows
         the chevron. -->
    <app-select-input size="sm" class="w-full">
      <!-- Selection is marked on the option rather than bound on the <select>:
           a value binding is applied before the options exist and the element
           silently falls back to the first one. -->
      <select
        [attr.aria-label]="ariaLabel()"
        (change)="onSelect($event)"
        class="-ml-1 w-full cursor-pointer appearance-none truncate rounded-sm
               border border-transparent bg-transparent py-1 pr-7 pl-1
               font-medium
               hover:border-edge-strong hover:bg-white"
        [class.text-ink]="value()"
      >
        @for (option of options(); track option.value) {
          <option
            [value]="option.value"
            [selected]="option.value === value()"
            [attr.selected]="option.value === value() ? '' : null"
          >
            {{ indent(option.depth) }}{{ option.label }}
          </option>
        }
      </select>
    </app-select-input>
  `,
})
export class GridFilterSelect {
  private readonly navigate = injectGridNav();

  /** The query parameter this filter writes. */
  readonly param = input.required<string>();
  readonly options = input.required<readonly GridFilterOption[]>();
  /** The value in effect; the empty string when unfiltered. */
  readonly value = input('');
  readonly ariaLabel = input('');
  /** What a choice writes, when it is more than `param`. */
  readonly toParams = input<GridFilter['toParams']>();

  /** An empty choice clears the parameter: one plain URL unfiltered. */
  protected onSelect(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value;
    this.navigate(
      filterParams(
        { param: this.param(), toParams: this.toParams() },
        selected,
      ),
    );
  }

  protected indent(depth = 0): string {
    return '   '.repeat(depth);
  }
}
