import { Directive } from '@angular/core';

/**
 * A line saying the app would not do something: under a refused field, or
 * for a whole form or page. The spacing stays with the call site.
 *
 *   <p appErrorText class="mt-1">{{ text.required }}</p>
 */
@Directive({
  selector: '[appErrorText]',
  host: { class: 'text-sm text-danger' },
})
export class ErrorText {}
