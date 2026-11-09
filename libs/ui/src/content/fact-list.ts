import { computed, Directive, input } from '@angular/core';

import { FactTerm } from './fact-term';
import { FactValue } from './fact-value';

/** The term column's width, and a gap to suit it. */
const widths = {
  narrow: 'gap-x-6 sm:grid-cols-[7rem_1fr]',
  wide: 'gap-x-8 sm:grid-cols-[12rem_1fr]',
} as const;

/**
 * Labelled facts, a term beside its value from `sm` up and over it below.
 * Breaking, because one long word (an email) would otherwise widen the value
 * track past the screen. Text size and outer spacing stay with the caller.
 *
 *   <dl uiFactList class="text-sm">
 *     @for (row of rows(); track row.label) {
 *       <dt uiFactTerm>{{ row.label }}</dt>
 *       <dd uiFactValue>{{ row.value }}</dd>
 *     }
 *   </dl>
 */
@Directive({
  selector: 'dl[uiFactList]',
  host: { '[class]': 'classes()' },
})
export class FactList {
  readonly terms = input<keyof typeof widths>('wide');

  protected readonly classes = computed(
    () => `grid wrap-break-word ${widths[this.terms()]}`,
  );
}

export const FACT_LIST = [FactList, FactTerm, FactValue] as const;

// The compiler references an imported array's directives through the module
// the array came from (NG3004), so this one re-exports them.
export { FactTerm, FactValue };
