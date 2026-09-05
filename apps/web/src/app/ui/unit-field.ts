import { Component, input } from '@angular/core';

/**
 * What the input inside a UnitField wears instead of `appInput`: the wrapper
 * carries the border, the background and the focus ring, so the field itself
 * is a bare box that fills what is left of the row.
 */
export const UNIT_FIELD_INPUT =
  'h-10 min-w-0 flex-1 bg-transparent px-2 py-1.5 leading-6 outline-none disabled:cursor-not-allowed';

/**
 * A field with its unit printed inside it, after the figure it measures — the
 * packaging editor's rows, the stock counts. The unit is part of what the
 * field says rather than a caption under it, which is the only shape that
 * survives a narrow column: a label above, a hint below and a unit beside
 * would be four lines for one number.
 *
 * A wrapper rather than a directive on the input, for SelectField's reason —
 * the unit is a *sibling*, which a directive on the input cannot add. Flex
 * rather than an overlay, so a locale whose abbreviation is four characters
 * long shortens the field instead of being clipped by it.
 *
 *   <app-unit-field class="w-full" unit="pcs">
 *     <input [class]="unitFieldInput" … />
 *   </app-unit-field>
 */
@Component({
  selector: 'app-unit-field',
  host: {
    class:
      'flex items-center rounded-md border border-border-strong focus-within:outline-1 focus-within:-outline-offset-1 focus-within:outline-secondary bg-white has-[input:disabled]:bg-stone-100',
  },
  template: `
    <ng-content />
    @if (unit()) {
      <span class="pr-2 text-xs text-subtle">{{ unit() }}</span>
    }
  `,
})
export class UnitField {
  readonly unit = input<string>('');
}
