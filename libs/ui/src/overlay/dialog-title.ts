import { Directive } from '@angular/core';

/**
 * A dialog's heading, lighter than a page's.
 *
 *   <h2 uiDialogTitle id="x-heading">{{ text.heading }}</h2>
 */
@Directive({
  selector: '[uiDialogTitle]',
  host: { class: 'text-xl font-normal tracking-tight' },
})
export class DialogTitle {}
