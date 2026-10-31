import { Component, inject } from '@angular/core';
import { Segment } from '@b2b-catalog-platform/ui/choices/segment';
import { SegmentGroup } from '@b2b-catalog-platform/ui/choices/segment-group';
import { layoutGridIcon } from '@b2b-catalog-platform/ui/icons/glyphs/layout-grid';
import { layoutListIcon } from '@b2b-catalog-platform/ui/icons/glyphs/layout-list';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { ProductLayoutService } from './product-layout';

/** Cards or lines (FR-CAT-06), on the neutral pill the sort beside it uses:
 * both arrange the listing rather than decide anything. Glyphs only; the
 * names are the buttons' accessible ones. */
@Component({
  selector: 'app-product-layout-toggle',
  // Hidden where card and line converge on one shape. Keyed to the listing's
  // own container at LISTING_NARROW, not to `sm`: the two disagree by the
  // frame's padding and the scrollbar.
  host: { class: 'hidden @min-[38rem]/listing:block' },
  imports: [Icon, Segment, SegmentGroup],
  template: `
    <div
      uiSegmentGroup
      tone="neutral"
      role="group"
      class="h-8 items-center"
      [attr.aria-label]="text.labelAria"
    >
      @for (option of options; track option.layout) {
        <button
          type="button"
          uiSegment
          [state]="chosen() === option.layout ? 'selected' : 'available'"
          class="flex h-full items-center px-2"
          [attr.aria-pressed]="chosen() === option.layout"
          [attr.aria-label]="option.label"
          [title]="option.label"
          (click)="layout.set(option.layout)"
        >
          <ui-icon [glyph]="option.glyph" class="size-4" />
        </button>
      }
    </div>
  `,
})
export class ProductLayoutToggle {
  protected readonly layout = inject(ProductLayoutService);
  protected readonly text = inject(STOREFRONT_TEXT).catalog.layout;
  protected readonly chosen = this.layout.layout;
  protected readonly options = [
    { layout: 'grid', glyph: layoutGridIcon, label: this.text.grid },
    { layout: 'list', glyph: layoutListIcon, label: this.text.list },
  ] as const;
}
