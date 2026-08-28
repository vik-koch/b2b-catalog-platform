import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { Icon } from '../ui/icons/icon';
import { HeaderCollapse } from './header-collapse';

/**
 * Back to the top of the page, closing the footer's action row — which is
 * where a reader who has run out of page already is.
 *
 * It is always drawn, and drawn the same: a row that gains and loses a control
 * as the page moves would reflow under the cursor, and a control that greys out
 * and back reads as something breaking rather than as a state. What changes is
 * only whether it answers — it is live from the moment the header collapses,
 * which is exactly the moment there is a top to go back to, and inert while the
 * reader is still up there. Hover is what tells the two apart: the hint and the
 * colour change appear only while there is something to click.
 */
@Component({
  selector: 'app-scroll-to-top',
  imports: [Icon],
  host: { class: 'inline-flex items-center' },
  template: `
    <button
      type="button"
      class="inline-flex cursor-pointer rounded-full text-primary transition-colors hover:text-accent active:text-secondary disabled:cursor-default disabled:hover:text-primary"
      [disabled]="!collapsed()"
      [title]="label"
      (click)="toTop()"
    >
      <app-icon name="circle-chevron-up" class="h-6 w-6" />
      <span class="sr-only">{{ label }}</span>
    </button>
  `,
})
export class ScrollToTop {
  protected readonly label = inject(APP_TEXT).a11y.scrollToTop;
  protected readonly collapsed = inject(HeaderCollapse).collapsed;

  protected toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
