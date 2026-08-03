import { Component, input } from '@angular/core';
import { LucideIcon } from '../../ui/icons/lucide-icon';
import { injectGridNav } from './grid-query';

export interface GridFilterOption {
  /** The URL value; the empty string means "no filter" and is left out. */
  value: string;
  label: string;
  /** Tree depth, for the category filter's indented options. */
  depth?: number;
}

/**
 * A filter that lives in its own column heading (FR-ADM-05) — publication state
 * and category, the two things the grid narrows by.
 *
 * A native `<select>` rather than a popover menu: a handful of mutually
 * exclusive values is what the element is for, and it arrives with keyboard
 * support, an accessible name and a usable mobile picker. Styled down to header
 * weight — no border until it is hovered or focused — so a row of filters reads
 * as column headings rather than as a form sitting on top of the table.
 *
 * Like the sort headers, it owns its own navigation: the filter is a query
 * parameter, and merging one parameter is the same operation wherever it is
 * used, so the host never has to know how the URL is built.
 */
@Component({
  selector: 'app-grid-filter-select',
  imports: [LucideIcon],
  template: `
    <div class="relative inline-flex">
      <!-- Selection is marked on the option rather than bound on the <select>:
           a value binding is applied before the options exist and the element
           silently falls back to the first one. -->
      <select
        [attr.aria-label]="ariaLabel()"
        (change)="onSelect($event)"
        class="w-full cursor-pointer appearance-none truncate rounded border border-transparent bg-transparent py-1 pr-6 pl-1 font-medium hover:border-border-strong hover:bg-white focus:outline-none"
        [class.text-stone-700]="value()"
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
      <app-lucide-icon
        name="chevron-down"
        class="pointer-events-none absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
      />
    </div>
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

  /** An empty choice clears the parameter rather than writing `?x=`, so the
   * unfiltered grid keeps the one plain URL it started with. */
  protected onSelect(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value;
    this.navigate({ [this.param()]: selected || null });
  }

  protected indent(depth = 0): string {
    return '   '.repeat(depth);
  }
}
