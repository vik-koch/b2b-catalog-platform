import { Directive } from '@angular/core';

/**
 * The paragraph under a page's title that says what the page is for. The
 * spacing and any line-length cap stay with the page.
 *
 *   <p appPageIntro class="mb-4">{{ text.intro }}</p>
 */
@Directive({
  selector: '[appPageIntro]',
  host: { class: 'text-ink-subtle' },
})
export class PageIntro {}
