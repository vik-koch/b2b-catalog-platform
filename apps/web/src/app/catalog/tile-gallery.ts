import { Component, computed, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { ImagePlaceholder } from './image-placeholder';

/** Below this horizontal travel a touch gesture counts as a tap, not a swipe. */
const SWIPE_THRESHOLD_PX = 30;

/**
 * The product-tile image slider (FR-CAT-04): no buttons. On a pointer device,
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
      class="relative block aspect-square overflow-hidden bg-stone-100"
      (pointermove)="onScrub($event)"
      (pointerleave)="reset()"
      (touchstart)="onTouchStart($event)"
      (touchend)="onTouchEnd($event)"
      (click)="onClick($event)"
    >
      @for (img of images(); track $index) {
        <img
          [src]="img.thumb"
          [alt]="productName()"
          class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
          [class.opacity-100]="$index === selected()"
          [class.opacity-0]="$index !== selected()"
          loading="lazy"
        />
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

  protected hasMultiple = computed(() => this.images().length > 1);

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
    this.selected.set(this.clamp(Math.floor(fraction * this.images().length)));
  }

  protected reset(): void {
    this.selected.set(0);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? 0;
    this.swiped = false;
  }

  protected onTouchEnd(event: TouchEvent): void {
    const dx = (event.changedTouches[0]?.clientX ?? 0) - this.touchStartX;
    if (!this.hasMultiple() || Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    this.swiped = true;
    this.selected.set(this.clamp(this.selected() + (dx < 0 ? 1 : -1)));
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
