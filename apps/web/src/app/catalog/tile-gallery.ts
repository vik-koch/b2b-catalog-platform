import {
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductImage } from '@b2b-catalog-platform/shared';
import { ImagePlaceholder } from './image-placeholder';
import { swipeStep, touchX } from './swipe';

/**
 * How soon a tile's first photo is fetched: `lazy` once it nears the viewport,
 * `eager` with the page, `high` ahead of the page's other images.
 */
export type ImagePriority = 'lazy' | 'eager' | 'high';

/**
 * The product-tile image slider (FR-CAT-04): no buttons.
 *
 * It fills whatever box the caller gives it (`aspect-square` on a card, the
 * height of the line beside it in a row), so the shape of the photo is the
 * caller's decision rather than one made in here. On a pointer device,
 * moving the cursor across the image scrubs through the photos — the image is
 * split into one zone per photo. On touch, a horizontal swipe steps between
 * them (and suppresses the tap so a swipe never navigates). The whole thing is
 * a link to the product, so with no JS (or before hydration) it is simply the
 * first image behind a working link.
 *
 * A picture showing one of the product's variants carries its name against
 * the photo's left edge (FR-CAT-11), so scrubbing through the pictures names
 * them. `labels` is off where the photo is too small to carry one — a row's —
 * and the variants are reached through a mark beside it instead (FR-CAT-13).
 */
@Component({
  selector: 'app-tile-gallery',
  imports: [RouterLink, ImagePlaceholder],
  host: { class: 'relative' },
  template: `
    <!-- The link clips the photos to the caller's rounding, so the box around
         it need not clip what hangs past its edge. -->
    <a
      [routerLink]="link()"
      [attr.aria-label]="productName()"
      class="relative block h-full overflow-hidden bg-white [border-radius:inherit]"
      (pointerenter)="revealNext()"
      (pointermove)="onScrub($event)"
      (pointerleave)="onPointerLeave($event)"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd($event)"
      (click)="onClick($event)"
    >
      @for (img of images(); track $index) {
        @if (failed().has(img.thumb)) {
          <app-image-placeholder
            [label]="productName()"
            class="absolute inset-0 transition-opacity duration-200"
            [class.opacity-100]="$index === selected()"
            [class.opacity-0]="$index !== selected()"
          />
        } @else {
          <!-- attr.src, so an unrevealed photo renders with no source at all
               rather than an empty one (which the browser would resolve against
               the page URL and fetch). -->
          <!-- loading before src: a browser that sees the source first may
               start the fetch before it learns the image can wait. -->
          <img
            [attr.loading]="priority() === 'lazy' ? 'lazy' : null"
            [attr.fetchpriority]="
              priority() === 'high' && $index === 0 ? 'high' : null
            "
            [attr.src]="sourceFor($index)"
            [alt]="altFor(img)"
            class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
            [class.opacity-100]="$index === selected()"
            [class.opacity-0]="$index !== selected()"
            (error)="markFailed(img.thumb)"
          />
        }
      } @empty {
        <app-image-placeholder [label]="productName()" />
      }

      @if (hasMultiple()) {
        <div
          class="pointer-events-none absolute inset-x-2 bottom-2 flex gap-1"
          aria-hidden="true"
        >
          @for (img of images(); track $index) {
            <span
              class="h-0.5 flex-1 rounded-full transition-colors"
              [class.bg-white]="$index === selected()"
              [class.bg-border-strong]="$index !== selected()"
            ></span>
          }
        </div>
      }
    </a>

    <!-- Against the left edge and clear of the top, a ribbon pinned to the
         picture rather than a badge floating on it; one line, shortened,
         since the name in full is in the picture's alt text. The alt text is
         what a screen reader gets, so this is hidden from it.

         One per picture, fading with it: a single label swapping its text
         changed a beat before the photo under it had. -->
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
  images = input.required<readonly ProductImage[]>();
  /** Router commands for the product this tile links to. */
  link = input.required<unknown[]>();
  /** Product name — the link's accessible label and each image's alt text. */
  productName = input.required<string>();
  /** Whether a picture showing a variant is labelled with it. */
  labels = input(true);
  /** Lazy by default: a listing is mostly below the fold. A caller that is
   * the first thing on its page says so. */
  priority = input<ImagePriority>('lazy');

  /** Whether the label hangs from the card's edge rather than the photo's —
   * where the photo stands inset by the card's padding. The caller then leaves
   * its box unclipped. */
  labelsOutside = input(false);

  /** Square against the edge and pointed at the other end — a ribbon's cut,
   * drawn by the clip rather than a border trick, so the point is the label's
   * own colour whatever the photo behind it is. The padding on the right is the
   * point's depth plus the text's own. */
  protected readonly labelClass = computed(
    () =>
      `pointer-events-none absolute ${this.labelsOutside() ? '-top-1 -left-3' : 'top-2 left-0'} max-w-[75%] truncate bg-secondary py-0.5 pr-3.5 pl-2 text-xs text-white transition-opacity duration-200 [clip-path:polygon(0_0,calc(100%-0.5rem)_0,100%_50%,calc(100%-0.5rem)_100%,0_100%)]`,
  );

  /** The product, and the variant where the picture shows one. */
  protected altFor(image: ProductImage): string {
    return image.variant
      ? `${this.productName()} — ${image.variant}`
      : this.productName();
  }

  /** Resets to the first image when the tile shows a different product. */
  protected selected = linkedSignal<readonly ProductImage[], number>({
    source: this.images,
    computation: () => 0,
  });

  /**
   * Indices that have been asked for. Every photo of every product used to get a
   * `src` up front — the extra copies are stacked in the viewport at
   * `opacity: 0`, and opacity does not stop a download, so a category page
   * fetched roughly three images per tile to show one. Only the first is
   * fetched now; the rest are attached the moment they are wanted, which the
   * pointer/touch entering the tile gets a head start on.
   */
  private readonly revealed = linkedSignal<
    readonly ProductImage[],
    Set<number>
  >({
    source: this.images,
    computation: () => new Set([0]),
  });

  /** The image's URL once it has been revealed, else null (no src attribute). */
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

  /** Selecting an image is also what makes it load. */
  private select(index: number): void {
    this.reveal(index);
    this.selected.set(index);
  }

  protected hasMultiple = computed(() => this.images().length > 1);

  /** Thumb URLs that failed to load — rendered as the placeholder instead of
   * the browser's broken-image icon. Keyed by URL. */
  protected readonly failed = signal(new Set<string>());

  protected markFailed(src: string): void {
    this.failed.update((set) => new Set(set).add(src));
  }

  private touchStartX = 0;
  /** True once a touch has moved far enough to be a swipe, so the tap that
   * follows is cancelled rather than navigating. */
  private swiped = false;

  protected onScrub(event: PointerEvent): void {
    // Touch scrubbing is handled as a swipe; only a real pointer scrubs.
    if (event.pointerType !== 'mouse' || !this.hasMultiple()) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width === 0) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    this.select(this.clamp(Math.floor(fraction * this.images().length)));
  }

  /**
   * Only a mouse leaving resets the tile. A touch pointer fires pointerleave the
   * moment the finger lifts — and, per the Pointer Events spec, *before* the
   * touchend that ends the swipe. Resetting there put every swipe back at image
   * 0 first, so the gesture could only ever reach image 1: the reported "cannot
   * swipe past the second photo".
   */
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
