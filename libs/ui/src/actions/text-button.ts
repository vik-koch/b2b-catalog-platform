import { Directive } from '@angular/core';

/**
 * A control standing on its own ("show password", a map link under an
 * address) rather than a word in a sentence, so the underline waits for
 * hover. Inside running text, `appLink`.
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
