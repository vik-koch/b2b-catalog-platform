import { Component, computed, inject, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { SegmentOption, Segmented } from '../choices/segmented';
import { GRID_TEXT } from './grid-text';
import {
  factParams,
  factState,
  GridFact,
  GridFactFilter,
  GridFactState,
} from './grid-column';
import { injectGridNav } from './grid-nav';

/**
 * A fact filter's questions, one line per fact: any, has or missing. A choice
 * is written at once, as a column's filter is; the rows behind change while
 * the panel stays open.
 */
@Component({
  selector: 'ui-grid-facts',
  imports: [Icon, Segmented],
  host: { class: 'block' },
  template: `
    <ul class="divide-y divide-edge-subtle">
      @for (fact of filter().facts; track fact.value) {
        <li class="flex items-center justify-between gap-4 py-1.5">
          <span class="flex min-w-0 items-center gap-2 text-sm text-ink">
            @if (fact.icon) {
              <ui-icon [glyph]="fact.icon" class="size-4 shrink-0" />
            }
            {{ fact.label }}
          </span>
          <ui-segmented
            class="shrink-0"
            [ariaLabel]="fact.label"
            [options]="ways()"
            [value]="stateOf(fact)"
            (valueChange)="choose(fact, $event)"
          />
        </li>
      }
    </ul>
  `,
})
export class GridFacts {
  private readonly navigate = injectGridNav();
  private readonly gridText = inject(GRID_TEXT);

  readonly filter = input.required<GridFactFilter>();

  protected readonly ways = computed<SegmentOption<GridFactState>[]>(() => [
    { value: 'any', label: this.gridText.factAny },
    { value: 'has', label: this.gridText.factHas },
    { value: 'missing', label: this.gridText.factMissing },
  ]);

  protected stateOf(fact: GridFact): GridFactState {
    return factState(this.filter(), fact.value);
  }

  protected choose(fact: GridFact, state: GridFactState): void {
    this.navigate(factParams(this.filter(), fact.value, state));
  }
}
