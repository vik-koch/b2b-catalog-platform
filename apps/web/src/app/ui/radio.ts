import { Directive } from '@angular/core';
import { TICKABLE } from './checkbox';

/**
 * The app's radio (shadcn-style owned primitive), the twin of Checkbox: the
 * native control, sized and tinted, so a fulfilment card, a pickup office and
 * an address row are the same control rather than three sets of utilities.
 *
 * Sized to match Checkbox — 16px in the 20px line box of `text-sm` — so a form
 * mixing the two lines its controls up without a nudge per call site. It shares
 * everything but the shape and what fills it: a circle, and a dot drawn as an
 * inset white ring over the checked fill rather than as an image, which is the
 * one mark simple enough to state in a shadow.
 *
 * The ring is what sets the dot's size, inverted: it is measured inward from
 * the padding box, so a 14px inside (16px less the two borders) less two 2.5px
 * rings leaves a **9px dot**. Thinner ring, bigger dot.
 */
@Directive({
  selector: 'input[type="radio"][appRadio]',
  host: {
    class: `${TICKABLE} rounded-full checked:shadow-[inset_0_0_0_2.25px_#fff]`,
  },
})
export class Radio {}
