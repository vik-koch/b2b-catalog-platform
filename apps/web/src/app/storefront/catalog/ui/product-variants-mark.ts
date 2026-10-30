import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  ProductImage,
  ProductVariant,
} from '@b2b-catalog-platform/shared/core/catalog';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { injectNarrowScreen } from '@b2b-catalog-platform/ui/core/narrow-screen';
import { paletteIcon } from '@b2b-catalog-platform/ui/icons/glyphs/palette';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { DialogActions } from '@b2b-catalog-platform/ui/overlay/dialog-actions';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { Popover } from '@b2b-catalog-platform/ui/overlay/popover';
import { ProductVariantGallery } from '../../../core/catalog/product-page/product-variant-gallery';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';

/**
 * Opens a product's variants where its picture is too small to label them: a
 * row, a cart line (FR-CAT-13). On a click, not a hover: the bubble holds
 * pictures to point at. A modal below `sm`. Drawn as a link, not a badge: it
 * opens something.
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
    Link,
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
      <ui-icon [glyph]="paletteIcon" class="size-3.5 shrink-0" />
      <span uiLink class="truncate">{{ product.variants }}</span>
    </button>

    @if (open()) {
      @if (narrow()) {
        <dialog
          #dialog
          uiDialogPanel
          [attr.aria-label]="productName()"
          (cancel)="open.set(false)"
        >
          <app-product-variant-gallery
            [images]="images()"
            [variants]="variants()"
            [productName]="productName()"
            shape="stack"
          />
          <div uiDialogActions>
            <button
              uiButton
              variant="secondary"
              type="button"
              (click)="open.set(false)"
            >
              {{ actionText.close }}
            </button>
          </div>
        </dialog>
      } @else {
        <ui-popover
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
        </ui-popover>
      }
    }
  `,
})
export class ProductVariantsMark {
  protected readonly paletteIcon = paletteIcon;
  protected readonly text = inject(STOREFRONT_TEXT).catalog.variants;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  readonly variants = input.required<readonly ProductVariant[]>();
  readonly images = input.required<readonly ProductImage[]>();
  readonly productName = input.required<string>();

  protected readonly open = signal(false);
  protected readonly placement = signal<'below' | 'above'>('below');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  protected readonly label = computed(() =>
    fillText(this.text.markLabel, { count: this.variants().length }),
  );

  /** Safe on the server: nothing reads it until the mark is pressed. */
  protected readonly narrow = injectNarrowScreen('sm');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** A badge's box with nothing drawn in it, level with the badges beside. */
  protected readonly trigger = `inline-flex min-w-0 cursor-pointer
                                items-center gap-1 whitespace-nowrap border
                                border-transparent py-0.5 text-xs text-primary
                                hover:text-accent`;

  private readonly popover = viewChild(Popover, { read: ElementRef });

  protected toggle(): void {
    if (!this.open()) this.placement.set(this.side());
    this.open.set(!this.open());
  }

  /** Above only where below would run past the page's end and lengthen it.
   * Decided as it opens, before the bubble can be measured. */
  private side(): 'below' | 'above' {
    const view = this.document.defaultView;
    if (!view) return 'below';
    const anchor = this.host.nativeElement.getBoundingClientRect();
    const pageEnd = this.document.documentElement.scrollHeight - view.scrollY;
    const fitsBelow = anchor.bottom + this.bubbleHeight() <= pageEnd;
    const fitsAbove = anchor.top + view.scrollY >= this.bubbleHeight();
    return fitsBelow || !fitsAbove ? 'below' : 'above';
  }

  /** The 15rem picture, a thumbnail row per five pictures, the arrow's gap and
   * the padding; the list beside it scrolls. */
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
    // `showModal()` for the focus trap and top layer; removing it closes it.
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
    // A bubble below the window's edge is scrolled into view.
    afterRenderEffect(() => {
      // The panel: the popover's host is an anchor box with no height.
      const host = this.popover()?.nativeElement as HTMLElement | undefined;
      host
        ?.querySelector(':scope > div')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}
