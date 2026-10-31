import { Component, computed, inject, input } from '@angular/core';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { fillText } from '@b2b-catalog-platform/shared';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { PairingsService } from './pairings.service';
import { packagePlusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/package-plus';

/**
 * The sold-together marker (FR-SET-05), opening the shell's pairings dialog.
 * `marker` is a glyph for a tile's price row, always marked: without
 * counterparts there is no marker. `link` adds the word where a line is
 * spare; with `message` it opens a sentence about a cart line's shortfall.
 */
@Component({
  selector: 'app-product-pairings',
  imports: [Icon, IconButton, Link],
  // Not inline: a baseline keeps a descender's room, two pixels taller than
  // the note button beside it.
  host: { class: 'flex' },
  template: `
    @if (variant() === 'marker') {
      <button
        type="button"
        uiIconButton
        variant="marked"
        [attr.aria-label]="label()"
        [title]="label()"
        (click)="open()"
      >
        <ui-icon [glyph]="packagePlusIcon" />
      </button>
    } @else {
      <!-- Sized like the facts around it, not like the buy button. -->
      <p [class]="lineClass()">
        <!-- On the first line's middle: a wrapped shortfall would centre it
             beside neither line. -->
        <ui-icon [glyph]="packagePlusIcon" class="mt-0.5 size-4 shrink-0" />
        <!-- One flex item, so the sentence wraps as words. Written tight: a
             space around an interpolation inside the link is underlined; the
             one between the halves is an explicit ngsp. -->
        <!-- prettier-ignore -->
        <span><button type="button" uiLink class="text-left" [tone]="message() ? 'warning' : 'default'" (click)="open()">{{ message()?.link ?? product.pairings }}</button>@if (message(); as said) {&ngsp;{{ said.rest }}}</span>
      </p>
    }
  `,
})
export class ProductPairings {
  protected readonly packagePlusIcon = packagePlusIcon;
  protected readonly text = inject(STOREFRONT_TEXT).catalog.pairings;
  protected readonly product = inject(SHARED_TEXT).product;
  private readonly pairings = inject(PairingsService);

  readonly slug = input.required<string>();
  /** As the tile knows it, before anything is fetched. */
  readonly count = input.required<number>();
  readonly variant = input<'marker' | 'link'>('marker');
  /** The link's words and the rest of their sentence; amber, as a shortfall. */
  readonly message = input<{ link: string; rest: string } | null>(null);

  protected readonly lineClass = computed(
    () =>
      `flex items-start gap-1.5 self-start text-sm
       ${this.message() ? 'text-warning' : 'text-primary'}`,
  );
  protected readonly label = computed(() =>
    fillText(this.text.marker, { count: this.count() }),
  );

  protected open(): void {
    this.pairings.show(this.slug(), this.count());
  }
}
