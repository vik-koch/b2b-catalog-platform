import {
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { ImagePlaceholder } from './image-placeholder';

/** Below this horizontal travel a touch gesture counts as a tap, not a swipe. */
const SWIPE_THRESHOLD_PX = 30;

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
 */
@Component({
  selector: 'app-tile-gallery',
  imports: [RouterLink, ImagePlaceholder],
  template: `
    <a
      [routerLink]="link()"
      [attr.aria-label]="productName()"
      class="relative block h-full overflow-hidden bg-stone-100"
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
          <img
            [attr.src]="sourceFor($index)"
            [alt]="productName()"
            class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
            [class.opacity-100]="$index === selected()"
            [class.opacity-0]="$index !== selected()"
            loading="lazy"
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
              [class.bg-white/50]="$index !== selected()"
            ></span>
          }
        </div>
      }
    </a>
  `,
})
export class TileGallery {
  images = input.required<readonly CatalogImage[]>();
  /** Router commands for the product this tile links to. */
  link = input.required<unknown[]>();
  /** Product name — the link's accessible label and each image's alt text. */
  productName = input.required<string>();

  /** Resets to the first image when the tile shows a different product. */
  protected selected = linkedSignal<readonly CatalogImage[], number>({
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
    readonly CatalogImage[],
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
    this.touchStartX = event.changedTouches[0]?.clientX ?? 0;
    this.swiped = false;
    this.revealNext();
  }

  protected onTouchEnd(event: TouchEvent): void {
    const dx = (event.changedTouches[0]?.clientX ?? 0) - this.touchStartX;
    if (!this.hasMultiple() || Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    this.swiped = true;
    this.select(this.clamp(this.selected() + (dx < 0 ? 1 : -1)));
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
