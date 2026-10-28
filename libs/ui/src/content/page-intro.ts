import { Directive } from '@angular/core';

/**
 * The paragraph under a page's title that says what the page is for. The
 * spacing and any line-length cap stay with the page.
 *
 *   <p uiPageIntro class="mb-4">{{ text.intro }}</p>
 */
@Directive({
  selector: '[uiPageIntro]',
  host: { class: 'text-ink-subtle' },
})
export class PageIntro {}
