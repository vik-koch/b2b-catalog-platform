import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { Icon } from '../ui/icons/icon';
import { SEGMENTED_GROUP, segmentClass } from '../ui/segmented';
import { ProductLayout, ProductLayoutService } from './product-layout';

/**
 * Cards or lines (FR-CAT-04) — the same pill the unit selector uses, so a
 * choice between two ways of seeing the same thing looks like the app's other
 * choice between two ways of buying the same thing.
 *
 * Two glyphs and no words: the two layouts are what the icons draw, the choice
 * is undone by pressing the other one, and a listing header already carries a
 * labelled sort control beside it. The names are the buttons' accessible ones.
 *
 * Hidden below `sm`, where the card and the row converge on the same shape and
 * the control would offer a choice between two identical listings.
 */
@Component({
  selector: 'app-product-layout-toggle',
  // Not offered on a phone: there is only one shape a listing can take at that
  // width, and both layouts already take it. The choice itself is untouched,
  // so a wider window still shows what the visitor picked.
  host: { class: 'hidden sm:block' },
  imports: [Icon],
  template: `
    <div role="group" [attr.aria-label]="text.label" [class]="group">
      <button
        type="button"
        [class]="segment('grid')"
        [attr.aria-pressed]="chosen() === 'grid'"
        [attr.aria-label]="text.grid"
        [title]="text.grid"
        (click)="choose('grid')"
      >
        <app-icon name="layout-grid" class="h-4 w-4" />
      </button>
      <button
        type="button"
        [class]="segment('list')"
        [attr.aria-pressed]="chosen() === 'list'"
        [attr.aria-label]="text.list"
        [title]="text.list"
        (click)="choose('list')"
      >
        <app-icon name="layout-list" class="h-4 w-4" />
      </button>
    </div>
  `,
})
export class ProductLayoutToggle {
  private readonly layout = inject(ProductLayoutService);
  protected readonly text = inject(APP_TEXT).catalog.layout;
  protected readonly chosen = this.layout.layout;
  protected readonly group = `${SEGMENTED_GROUP} h-8.5 items-center`;

  protected segment(layout: ProductLayout): string {
    return `${segmentClass(this.chosen() === layout ? 'selected' : 'available')} flex h-full items-center px-2`;
  }

  protected choose(layout: ProductLayout): void {
    this.layout.set(layout);
  }
}
