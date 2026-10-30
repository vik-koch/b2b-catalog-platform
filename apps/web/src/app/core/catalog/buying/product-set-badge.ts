import { Component, computed, inject, input } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { formatPartList } from '@b2b-catalog-platform/shared/core/catalog';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { layers2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/layers-2';

/**
 * A product sold as a set of parts (FR-CAT-10): a fact, not a state, so no
 * status badge. Exactly the stock badge's height, so the two sit level.
 * `short` names the parts in its tooltip only: the card is a link, and a
 * button inside it would be a second target. `full` names them.
 */
@Component({
  selector: 'app-product-set-badge',
  imports: [Icon],
  // On a crowded line this one gives way: stock is the more urgent.
  host: { class: 'flex min-w-0' },
  template: `
    @if (variant() === 'short') {
      <span [class]="pill + ' whitespace-nowrap'" [title]="full()">
        <ui-icon [glyph]="layers2Icon" class="size-3.5 shrink-0" />
        <span class="truncate" aria-hidden="true">{{ text.short }}</span>
        <span class="sr-only">{{ full() }}</span>
      </span>
    } @else {
      <span [class]="pill + ' items-start leading-tight'">
        <ui-icon [glyph]="layers2Icon" class="size-3.5 shrink-0" />
        <span>{{ full() }}</span>
      </span>
    }
  `,
})
export class ProductSetBadge {
  protected readonly layers2Icon = layers2Icon;
  readonly parts = input.required<readonly string[]>();
  readonly variant = input<'short' | 'full'>('short');

  protected readonly text = inject(STOREFRONT_TEXT).catalog.set;

  protected readonly full = computed(() =>
    fillText(this.text.full, { parts: formatPartList(this.parts()) }),
  );

  /** A tint of the ink, not a grey ground: `surface` vanished on the
   * `surface-subtle` page a row sits on. */

  protected readonly pill = `inline-flex min-w-0 items-center gap-1.5
                             rounded-md border border-transparent bg-ink/5
                             px-1.5 py-0.5 text-xs font-medium text-ink-subtle
                             select-none`;
}
