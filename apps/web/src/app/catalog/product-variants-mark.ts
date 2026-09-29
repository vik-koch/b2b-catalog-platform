import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  fillText,
  ProductImage,
  ProductVariant,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { injectNarrowScreen } from '../core/narrow-screen';
import { Button } from '../ui/button';
import { DialogActions } from '../ui/dialog-actions';
import { DialogPanel } from '../ui/dialog-panel';
import { Icon } from '../ui/icons/icon';
import { LINK_BASE, LINK_TONES } from '../ui/link';
import { Popover } from '../ui/popover';
import { ProductVariantGallery } from './product-variants';

/**
 * Says a product comes in variants, where its picture is too small to label
 * them — a row in the lines listing, a cart line (FR-CAT-13) — and opens the
 * list the product page shows, with the pictures beside it.
 *
 * Opened by a click or a tap rather than by pointing: the bubble holds
 * pictures to point at, and one that opened on hover would close as the
 * pointer crossed the gap to reach them. On a phone the same content is a
 * modal, as the line note's is: there is nothing beside anything there.
 *
 * Drawn as the pairings line is — a glyph and an underlined word — rather
 * than as a badge beside the ones it stands with: a badge on this line states
 * a fact and does nothing, and this one opens something. It keeps a badge's
 * height, so the line does not grow for it.
 */
@Component({
  selector: 'app-product-variants-mark',
  imports: [
    Button,
    DialogActions,
    DialogPanel,
    Icon,
    Popover,
    ProductVariantGallery,
  ],
  host: { class: 'relative flex min-w-0' },
  template: `
    <button
      type="button"
      [class]="trigger"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [title]="label()"
      (click)="toggle()"
    >
      <app-icon name="palette" class="h-3.5 w-3.5 shrink-0" />
      <span [class]="word">{{ text.mark }}</span>
    </button>

    @if (open()) {
      @if (narrow()) {
        <dialog
          #dialog
          appDialogPanel
          [attr.aria-label]="productName()"
          (cancel)="open.set(false)"
        >
          <app-product-variant-gallery
            [images]="images()"
            [variants]="variants()"
            [productName]="productName()"
            shape="stack"
          />
          <div appDialogActions>
            <button
              appButton
              variant="secondary"
              type="button"
              (click)="open.set(false)"
            >
              {{ text.close }}
            </button>
          </div>
        </dialog>
      } @else {
        <app-popover
          align="start"
          [wide]="true"
          [placement]="placement()"
          (dismissed)="open.set(false)"
        >
          <app-product-variant-gallery
            [images]="images()"
            [variants]="variants()"
            [productName]="productName()"
            shape="side"
          />
        </app-popover>
      }
    }
  `,
})
export class ProductVariantsMark {
  protected readonly text = inject(APP_TEXT).catalog.variants;

  readonly variants = input.required<readonly ProductVariant[]>();
  readonly images = input.required<readonly ProductImage[]>();
  readonly productName = input.required<string>();

  protected readonly open = signal(false);
  protected readonly placement = signal<'below' | 'above'>('below');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  protected readonly label = () =>
    fillText(this.text.markLabel, { count: String(this.variants().length) });

  /** Below `sm` the list is a modal rather than a bubble. Safe on an SSR page:
   * nothing reads it until the mark is pressed. */
  protected readonly narrow = injectNarrowScreen('sm');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** A badge's box — its text size, padding and transparent border — with
   * nothing drawn in it, so it sits level with the badges beside it. */
  protected readonly trigger =
    'inline-flex min-w-0 cursor-pointer items-center gap-1 whitespace-nowrap border border-transparent py-0.5 text-xs text-primary hover:text-accent';
  protected readonly word = `truncate ${LINK_BASE} ${LINK_TONES.default}`;

  private readonly popover = viewChild(Popover, { read: ElementRef });

  protected toggle(): void {
    if (!this.open()) this.placement.set(this.side());
    this.open.set(!this.open());
  }

  /**
   * Below the mark unless that would carry the bubble past the end of the
   * page: a bubble hanging off the last row lengthened the page by its own
   * height and left the footer stranded mid-screen. Above it then, where the
   * rows before it are. Decided once, as it opens, from the room the page has
   * — the bubble is not on screen yet to be measured, so its height is worked
   * out from what it will hold.
   */
  private side(): 'below' | 'above' {
    const view = this.document.defaultView;
    if (!view) return 'below';
    const anchor = this.host.nativeElement.getBoundingClientRect();
    const pageEnd = this.document.documentElement.scrollHeight - view.scrollY;
    const fitsBelow = anchor.bottom + this.bubbleHeight() <= pageEnd;
    const fitsAbove = anchor.top + view.scrollY >= this.bubbleHeight();
    return fitsBelow || !fitsAbove ? 'below' : 'above';
  }

  /** The bubble's height in pixels: the 15rem picture, a row of thumbnails
   * for every five pictures past the first, the gap under the arrow and the
   * panel's padding. The list beside it scrolls, so it adds nothing. */
  private bubbleHeight(): number {
    const rem = parseFloat(
      this.document.defaultView?.getComputedStyle(this.document.documentElement)
        .fontSize ?? '16',
    );
    const count = this.images().length;
    const rows = count > 1 ? Math.ceil(count / 5) : 0;
    return (15 + rows * 3.6 + 2.5) * rem;
  }

  constructor() {
    // `showModal()` is what gives the dialog its focus trap, backdrop and top
    // layer; removing it from the template is what closes it.
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
    // A row near the bottom of the window opens a bubble below its edge. The
    // page scrolls it into view rather than the bubble choosing a side: above
    // the mark it would cover the row's own name.
    afterRenderEffect(() => {
      // The panel, not the popover's host: the host is an anchor box with no
      // height of its own, and the panel hangs out of it.
      const host = this.popover()?.nativeElement as HTMLElement | undefined;
      host
        ?.querySelector(':scope > div')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}
