import { Component, computed, inject, input } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { formatPartList } from '@b2b-catalog-platform/shared/core/catalog';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { layers2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/layers-2';

/**
 * Says a product is sold as a set of parts (FR-CAT-10) — one piece is a cup
 * with its lid, where the product beside it in the listing may be the cup
 * alone.
 *
 * A fact about the product rather than a state of it, so it is not a status
 * badge: no dot, no tone, a grey ground. Its height matches the stock badge's
 * to the pixel — the same text size and vertical padding, and a transparent
 * border where that one has a hairline — so the two sit level on one line. The
 * short one is narrower at the sides: it shares a card's line with the stock
 * badge, and the longest stock wording has to leave it room.
 *
 * `short` is a listing's: the word alone, the parts in the tooltip and for a
 * screen reader. There is no popover — the card is a link to the page that
 * says it in full, and a button inside it would be a second target under the
 * finger. `full` is the product page's, which has the room to name them.
 */
@Component({
  selector: 'app-product-set-badge',
  imports: [Icon],
  // min-w-0 so the one badge on a crowded line that can give way is this one:
  // the stock state is the more urgent of the two.
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

  /**
   * A tint of the ink rather than a grey ground, so the chip stands the same
   * step off whatever it sits on: `surface` read clearly on a white card
   * and all but vanished on the `surface-subtle` page a row and the product panel sit on.
   */
  protected readonly pill = `inline-flex min-w-0 items-center gap-1.5
                             rounded-md border border-transparent bg-ink/5
                             px-1.5 py-0.5 text-xs font-medium text-ink-subtle
                             select-none`;
}
