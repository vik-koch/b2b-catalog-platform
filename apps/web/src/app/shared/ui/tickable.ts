import { Directive, inject } from '@angular/core';
import { TickLabel } from './tick-label';

/** Onto the first 20px line of `text-sm`, which the 16px box is shorter than. */
const inRow = 'mt-0.5';

/**
 * What Checkbox and Radio share: a native control painted by us, because a
 * stylesheet cannot recolour an unchecked box's edge. `appearance-none` keeps
 * the element an `<input>`, with its keyboard, form and name untouched.
 *
 * Hover answers from the whole `<label>` around it, not only the 16px square:
 * the label's words are most of what there is to point at. Written as an
 * arbitrary variant because `hover:` cannot reach a parent's hover.
 */
@Directive({
  selector: '[appTickable]',
  host: {
    class: `size-4 shrink-0 cursor-pointer appearance-none border
            border-edge-strong bg-white bg-contain bg-center bg-no-repeat
            transition-colors
            checked:border-primary checked:bg-primary checked:hover:bg-accent
            hover:border-accent
            [@media(hover:hover)]:[label:hover_&:not(:disabled)]:border-accent
            [@media(hover:hover)]:[label:hover_&:checked:not(:disabled)]:bg-accent
            disabled:cursor-not-allowed disabled:opacity-60`,
    '[class]': 'alignment',
  },
})
export class Tickable {
  protected readonly alignment = inject(TickLabel, { optional: true })
    ? inRow
    : '';
}
