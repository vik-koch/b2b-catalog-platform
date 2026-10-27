import { computed, Directive, input } from '@angular/core';

/**
 * Height is a floor, not padding, so a wrapping label grows by one line
 * rather than by a line plus the padding again.
 */
const sizes = {
  md: 'min-h-9 px-4 py-1 leading-tight',
  /** Dense rows: pagination, table row actions. */
  sm: 'min-h-8 px-3 py-1 leading-tight',
} as const;

export type ButtonSize = keyof typeof sizes;

/**
 * A button's box without the button: its shape, type and size. Button is
 * built on it, and an element that takes a button's place (a label left where
 * the button was) uses it to keep the same box, so the row does not move.
 *
 *   <p appButtonBox class="bg-secondary text-white" role="status">…</p>
 */
@Directive({
  selector: '[appButtonBox]',
  host: { '[class]': 'classes()' },
})
export class ButtonBox {
  readonly size = input<ButtonSize>('md');

  protected readonly classes = computed(
    () =>
      `inline-flex items-center justify-center rounded-md text-sm font-medium
       ${sizes[this.size()]}`,
  );
}
