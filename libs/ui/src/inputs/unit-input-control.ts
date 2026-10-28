import { computed, Directive, inject } from '@angular/core';
import { UnitInput } from './unit-input';

const base = `h-10 min-w-0 flex-1 bg-transparent px-2 py-1.5 leading-6
              outline-none
              disabled:cursor-not-allowed`;

/** Close up to the unit: see UnitInput. */
const compact = 'sm:pr-1';

/**
 * The input inside a UnitInput, in place of `uiInput`: a bare box filling
 * the row, since the wrapper carries the border, ground and focus. In a
 * compact field the figure sits close up to its unit from `sm` up.
 *
 *   <ui-unit-input unit="pcs">
 *     <input uiUnitInputControl [formField]="…" />
 *   </ui-unit-input>
 */
@Directive({
  selector: 'input[uiUnitInputControl]',
  host: { '[class]': 'classes()' },
})
export class UnitInputControl {
  private readonly field = inject(UnitInput, { optional: true });

  protected readonly classes = computed(
    () => `${base} ${this.field?.compact() ? compact : ''}`,
  );
}
