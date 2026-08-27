import { Directive } from '@angular/core';

/**
 * The app's radio (shadcn-style owned primitive), the twin of Checkbox: the
 * native control, sized and tinted, so a fulfilment card, a pickup office and
 * an address row are the same control rather than three sets of utilities.
 *
 * Sized to match Checkbox — 16px in the 20px line box of `text-sm` — so a form
 * mixing the two lines its controls up without a nudge per call site.
 */
@Directive({
  selector: 'input[type="radio"][appRadio]',
  host: {
    class:
      'h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60',
  },
})
export class Radio {}
