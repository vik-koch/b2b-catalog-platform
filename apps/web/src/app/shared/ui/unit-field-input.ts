import { computed, Directive, inject } from '@angular/core';
import { UnitField } from './unit-field';

const base = `h-10 min-w-0 flex-1 bg-transparent px-2 py-1.5 leading-6
              outline-none
              disabled:cursor-not-allowed`;

/** Close up to the unit: see UnitField. */
const compact = 'sm:pr-1';

/**
 * The input inside a UnitField, in place of `appInput`: a bare box filling
 * the row, since the wrapper carries the border, ground and focus. In a
 * compact field the figure sits close up to its unit from `sm` up.
 *
 *   <app-unit-field unit="pcs">
 *     <input appUnitFieldInput [formField]="…" />
 *   </app-unit-field>
 */
@Directive({
  selector: 'input[appUnitFieldInput]',
  host: { '[class]': 'classes()' },
})
export class UnitFieldInput {
  private readonly field = inject(UnitField, { optional: true });

  protected readonly classes = computed(
    () => `${base} ${this.field?.compact() ? compact : ''}`,
  );
}
