import { Component, inject } from '@angular/core';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { HeaderCollapse } from '../../platform/header-collapse';
import { chevronUpIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-up';

/** Back to the top, always drawn so the row never reflows, and live once the
 * header has collapsed. An outlined disc: it acts on the page, unlike the
 * navbar's bare glyphs. */
@Component({
  selector: 'app-scroll-to-top',
  imports: [Icon],
  host: { class: 'inline-flex items-center' },
  template: `
    <button
      type="button"
      class="inline-flex size-9 cursor-pointer items-center justify-center
             rounded-full border border-edge-strong bg-surface-subtle
             text-ink-subtle transition-colors
             hover:border-accent hover:text-accent
             active:border-primary-press active:text-primary-press
             disabled:cursor-default disabled:border-edge
             disabled:bg-transparent disabled:text-ink-disabled"
      [disabled]="!collapsed()"
      [title]="label"
      (click)="toTop()"
    >
      <ui-icon [glyph]="chevronUpIcon" class="size-4" />
      <span class="sr-only">{{ label }}</span>
    </button>
  `,
})
export class ScrollToTop {
  protected readonly chevronUpIcon = chevronUpIcon;
  protected readonly label = inject(STOREFRONT_TEXT).a11y.scrollToTop;
  protected readonly collapsed = inject(HeaderCollapse).collapsed;

  protected toTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
