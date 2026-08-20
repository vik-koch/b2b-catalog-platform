import { Directive } from '@angular/core';

/**
 * The app's checkbox (shadcn-style owned primitive): the native control, sized
 * and tinted, so a consent box, a sync option and a picker row are the same
 * control rather than three sets of utility classes.
 *
 * Sized explicitly so it can be aligned exactly: 16px in the 20px line box of
 * `text-sm`. A row that aligns to the first line of wrapping text (`items-start`)
 * adds `mt-0.5` for the 2px nudge — that is layout, and stays with the caller.
 *
 *   <label class="flex items-start gap-2 text-sm">
 *     <input type="checkbox" appCheckbox class="mt-0.5" />
 *     <span>…</span>
 *   </label>
 */
@Directive({
  selector: 'input[type="checkbox"][appCheckbox]',
  host: {
    class:
      'h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60',
  },
})
export class Checkbox {}
