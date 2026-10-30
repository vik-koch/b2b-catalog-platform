import {
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductImage } from '@b2b-catalog-platform/shared/core/catalog';
import { ImagePlaceholder } from '@b2b-catalog-platform/ui/content/image-placeholder';
import { swipeStep, touchX } from '../../../core/catalog/product-page/swipe';

/** `lazy` near the viewport, `eager` with the page, `high` ahead of other
 * images. Only the first photo; the rest load when wanted. */
export type ImagePriority = 'lazy' | 'eager' | 'high';

/**
 * A product's photos in the caller's box (FR-CAT-04), without buttons: a mouse
 * scrubs across them, a swipe steps through them. The whole is a link, so
 * before hydration it is the first photo behind a working one. A variant's
 * picture carries its name (FR-CAT-11) unless `labels` is off.
 */
@Component({
  selector: 'app-tile-gallery',
  imports: [RouterLink, ImagePlaceholder],
  host: { class: 'relative' },
  template: `
    <!-- Clipped here, so the caller's box need not clip a hanging label. -->
    <a
      [routerLink]="link()"
      [attr.aria-label]="productName()"
      class="relative block h-full overflow-hidden bg-white rounded-[inherit]"
      (pointerenter)="revealNext()"
      (pointermove)="onScrub($event)"
      (pointerleave)="onPointerLeave($event)"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd($event)"
      (click)="onClick($event)"
    >
      @for (img of images(); track $index) {
        @if (failed().has(img.thumb)) {
          <ui-image-placeholder
            [label]="productName()"
            class="absolute inset-0 transition-opacity duration-200"
            [class.opacity-100]="$index === selected()"
            [class.opacity-0]="$index !== selected()"
          />
        } @else {
          <!-- No src until revealed: an empty one fetches the page URL.
               loading before src, or the fetch may start before it learns
               the image can wait. -->
          <img
            [attr.loading]="priority() === 'lazy' ? 'lazy' : null"
            [attr.fetchpriority]="
              priority() === 'high' && $index === 0 ? 'high' : null
            "
            [attr.src]="sourceFor($index)"
            [alt]="altFor(img)"
            class="absolute inset-0 size-full bg-white object-contain
                   transition-opacity duration-200"
            [class.opacity-100]="$index === selected()"
            [class.opacity-0]="$index !== selected()"
            (error)="markFailed(img.thumb)"
          />
        }
      } @empty {
        <ui-image-placeholder [label]="productName()" />
      }

      @if (hasMultiple()) {
        <div
          class="pointer-events-none absolute inset-x-2 bottom-2 flex gap-1"
          aria-hidden="true"
        >
          @for (img of images(); track $index) {
            <span
              class="h-0.5 flex-1 rounded-full transition-colors"
              [class.bg-secondary]="$index === selected()"
              [class.bg-edge-strong]="$index !== selected()"
            ></span>
          }
        </div>
      }
    </a>

    <!-- Hidden from screen readers, which get the alt text. One per picture,
         fading with it: one label swapping its text ran a beat ahead. -->
    @if (labels()) {
      @for (img of images(); track $index) {
        @if (img.variant) {
          <span
            [class]="labelClass()"
            [class.opacity-100]="$index === selected()"
            [class.opacity-0]="$index !== selected()"
            aria-hidden="true"
            data-variant-label
          >
            {{ img.variant }}
          </span>
        }
      }
    }
  `,
})
export class TileGallery {
  readonly images = input.required<readonly ProductImage[]>();
  readonly link = input.required<unknown[]>();
  /** The link's accessible name and each photo's alt text. */
  readonly productName = input.required<string>();
  /** Off where the photo is too small, as on a row (FR-CAT-13). */
  readonly labels = input(true);
  readonly priority = input<ImagePriority>('lazy');
  /** The label hangs from the card's edge, for a photo inset by its padding;
   * the caller leaves its box unclipped. */
  readonly labelsOutside = input(false);

  /** A ribbon's point cut by the clip, so it keeps the label's colour; the
   * right padding is the point's depth plus the text's. */
  protected readonly labelClass = computed(
    () =>
      `pointer-events-none absolute ${this.labelsOutside() ? '-top-1 -left-3' : 'top-2 left-0'} max-w-[75%] truncate bg-secondary py-0.5 pr-3.5 pl-2 text-xs text-white transition-opacity duration-200 [clip-path:polygon(0_0,calc(100%-0.5rem)_0,100%_50%,calc(100%-0.5rem)_100%,0_100%)]`,
  );

  protected altFor(image: ProductImage): string {
    return image.variant
      ? `${this.productName()} — ${image.variant}`
      : this.productName();
  }

  /** Back to the first photo for another product. */
  protected readonly selected = linkedSignal<readonly ProductImage[], number>({
    source: this.images,
    computation: () => 0,
  });

  /** Indices asked for. The rest stack at `opacity: 0`, which does not stop a
   * download, so each gets its `src` only when wanted. */
  private readonly revealed = linkedSignal<
    readonly ProductImage[],
    Set<number>
  >({
    source: this.images,
    computation: () => new Set([0]),
  });

  protected sourceFor(index: number): string | null {
    return this.revealed().has(index)
      ? (this.images()[index]?.thumb ?? null)
      : null;
  }

  private reveal(index: number): void {
    if (
      index < 0 ||
      index >= this.images().length ||
      this.revealed().has(index)
    ) {
      return;
    }
    this.revealed.update((set) => new Set(set).add(index));
  }

  /** Warms the next photo before the gesture that would show it completes. */
  protected revealNext(): void {
    if (this.hasMultiple()) this.reveal(this.selected() + 1);
  }

  private select(index: number): void {
    this.reveal(index);
    this.selected.set(index);
  }

  protected readonly hasMultiple = computed(() => this.images().length > 1);

  /** Shown as the placeholder, not the browser's broken icon. */
  protected readonly failed = signal(new Set<string>());

  protected markFailed(src: string): void {
    this.failed.update((set) => new Set(set).add(src));
  }

  private touchStartX = 0;
  /** The tap after a swipe is cancelled, not followed. */
  private swiped = false;

  protected onScrub(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || !this.hasMultiple()) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width === 0) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    this.select(this.clamp(Math.floor(fraction * this.images().length)));
  }

  /** A mouse only: a touch fires pointerleave before the touchend that ends
   * the swipe, and resetting there kept every swipe on the second photo. */
  protected onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.selected.set(0);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = touchX(event);
    this.swiped = false;
    this.revealNext();
  }

  protected onTouchEnd(event: TouchEvent): void {
    const step = swipeStep(this.touchStartX, touchX(event));
    if (!this.hasMultiple() || step === 0) return;
    this.swiped = true;
    this.select(this.clamp(this.selected() + step));
  }

  protected onClick(event: MouseEvent): void {
    if (this.swiped) {
      event.preventDefault();
      event.stopPropagation();
      this.swiped = false;
    }
  }

  private clamp(index: number): number {
    return Math.max(0, Math.min(index, this.images().length - 1));
  }
}
