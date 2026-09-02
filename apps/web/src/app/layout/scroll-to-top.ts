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
 *
 * Outlined rather than a bare glyph, and a plain chevron rather than a circled
 * one: the navbar's controls are unboxed icons in the brand colour, and this
 * is not one of them — it acts on the page rather than going anywhere. An
 * outlined disc is what the app's other quiet controls look like, and it gives
 * a finger something 36px to land on.
 */
@Component({
  selector: 'app-scroll-to-top',
  imports: [Icon],
  host: { class: 'inline-flex items-center' },
  template: `
    <button
      type="button"
      class="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface text-muted transition-colors hover:border-accent hover:text-accent active:border-primary-deep active:text-primary-deep disabled:cursor-default disabled:border-border disabled:bg-transparent disabled:text-subtle disabled:hover:border-border disabled:hover:text-subtle"
      [disabled]="!collapsed()"
      [title]="label"
      (click)="toTop()"
    >
      <app-icon name="chevron-up" class="h-4 w-4" />
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
