import { Component, computed, input } from '@angular/core';

const unit = 'pr-3 text-xs text-ink-subtle';

/** As far from the edge as the figure is from the other one. */
const compactUnit = 'sm:pr-2';

/**
 * A field with its unit printed inside it, after the figure: in a narrow
 * column, a caption, a hint and a unit beside would be four lines for one
 * number. A wrapper, because the unit is a sibling a directive cannot add;
 * flex rather than an overlay, so a long unit shortens the field instead of
 * being clipped. The input inside takes `appUnitInputControl`.
 *
 *   <app-unit-input class="w-full" unit="pcs">
 *     <input appUnitInputControl … />
 *   </app-unit-input>
 */
@Component({
  selector: 'app-unit-input',
  // An `appInput`'s border states, on the wrapper that owns the border. Hover
  // excludes focus, which a plain input settles through the unlayered focus rule.
  host: {
    class: `flex items-center rounded-md border border-edge-strong bg-white
            transition-colors
            [&:has(input:enabled):not(:focus-within):hover]:border-accent
            focus-within:border-secondary focus-within:outline-1
            focus-within:-outline-offset-1 focus-within:outline-secondary
            has-[input:disabled]:bg-surface`,
  },
  template: `
    <ng-content />
    @if (unit()) {
      <span [class]="unitClass()">{{ unit() }}</span>
    }
  `,
})
export class UnitInput {
  readonly unit = input<string>('');
  /**
   * Sized to its figure rather than to the form from `sm` up, with the unit
   * as far from the edge as the figure is from the other one.
   */
  readonly compact = input(false);

  protected readonly unitClass = computed(
    () => `${unit} ${this.compact() ? compactUnit : ''}`,
  );
}
