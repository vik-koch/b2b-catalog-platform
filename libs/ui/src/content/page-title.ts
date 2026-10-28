import { Directive } from '@angular/core';

/**
 * A page's `<h1>`. The spacing around it stays with the page; a heading that
 * grows with its container rather than the viewport (a listing, the cart)
 * keeps its own classes.
 *
 *   <h1 uiPageTitle class="mb-4">{{ text.title }}</h1>
 */
@Directive({
  selector: '[uiPageTitle]',
  host: { class: 'text-3xl font-medium tracking-tight' },
})
export class PageTitle {}
