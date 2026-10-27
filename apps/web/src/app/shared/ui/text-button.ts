import { Directive } from '@angular/core';

/**
 * A control that stands on its own — "show password", "enter manually", a
 * map link under an address — rather than a word inside a sentence. Position
 * and spacing already say it is operable, so the underline is kept for hover
 * and the colour and weight carry it at rest. Inside running text, `appLink`.
 *
 *   <button type="button" appTextButton (click)="…">{{ label }}</button>
 */
@Directive({
  selector: '[appTextButton]',
  host: {
    class: `cursor-pointer font-medium underline-offset-2 text-primary
            hover:text-accent hover:underline`,
  },
})
export class TextButton {}
