import { Directive } from '@angular/core';

/**
 * A page's `<h2>` over a section of its own, matching an `<h2>` in the prose
 * above it. Spacing stays with the caller.
 *
 *   <h2 uiPageSectionTitle class="mb-4">{{ text.payment }}</h2>
 */
@Directive({
  selector: '[uiPageSectionTitle]',
  host: { class: 'text-2xl font-normal tracking-tight' },
})
export class PageSectionTitle {}
