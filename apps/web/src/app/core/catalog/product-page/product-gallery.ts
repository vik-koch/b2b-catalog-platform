import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { ProductImage } from '@b2b-catalog-platform/shared/core/catalog';

import { swipeStep, touchX } from './swipe';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { ShowMoreToggle } from '@b2b-catalog-platform/ui/disclosure/show-more-toggle';
import { ImagePlaceholder } from '@b2b-catalog-platform/ui/content/image-placeholder';
import { Frame } from '@b2b-catalog-platform/ui/content/frame';

/** One row of the narrow grid kept on a phone; the rest behind a show-more. */
const THUMBS_COLLAPSED = 5;

/** Six squares and five gutters divide the photo's height exactly. */
const THUMBS_BESIDE = 6;

/**
 * The product page's pictures (FR-CAT-05): one large, the rest as thumbnails.
 * From `md` up to six stand in a strip left of the photo, away from the buying
 * panel, costing no height; past six they go under it, six to a row. Below
 * `md` they are a row under it, five kept. `compact` is that narrow shape at
 * every width, for a bubble. Nothing is printed over a picture: the variant
 * list says which one is on show (FR-CAT-11).
 */
@Component({
  selector: 'app-product-gallery',
  imports: [ImagePlaceholder, ShowMoreToggle, Frame],
  template: `
    <div [class]="frameClass()">
      <!-- A swipe steps between photos, as on a tile; this photo is no link,
           so nothing needs suppressing. touch-pan-y keeps vertical scroll. -->
      <div
        data-main-image
        uiFrame
        [class]="mainImage()"
        (touchstart)="onTouchStart($event)"
        (touchend)="onTouchEnd($event)"
      >
        @if (current(); as img) {
          @if (failed().has(img.full)) {
            <ui-image-placeholder [label]="productName()" />
          } @else {
            <!-- The page's largest element, fetched ahead of the others. -->
            <img
              [src]="img.full"
              [alt]="altFor(img)"
              class="size-full bg-white object-contain"
              fetchpriority="high"
              (error)="markFailed(img.full)"
            />
          }
        } @else {
          <ui-image-placeholder [label]="productName()" />
        }
      </div>

      @if (images().length > 1) {
        <ul [class]="thumbsClass()">
          @for (img of images(); track $index) {
            <!-- Folded on the thumb, not by an nth-child rule: a class naming
                 an ancestor is lost from the critical CSS (see Icon). -->
            <li [class]="folded($index) ? 'max-md:hidden' : ''">
              <button
                type="button"
                uiFrame
                [selected]="$index === selected()"
                [pressable]="true"
                class="block aspect-square w-full overflow-hidden rounded-md
                       transition-shadow"
                [attr.aria-current]="$index === selected() || null"
                [attr.aria-label]="thumbLabel($index)"
                (click)="select($index)"
                (mouseenter)="select($index)"
              >
                @if (failed().has(img.thumb)) {
                  <ui-image-placeholder />
                } @else {
                  <img
                    [src]="img.thumb"
                    alt=""
                    class="size-full bg-white object-contain"
                    loading="lazy"
                    (error)="markFailed(img.thumb)"
                  />
                }
              </button>
            </li>
          }
        </ul>
        @if (!compact() && images().length > THUMBS_COLLAPSED) {
          <ui-show-more-toggle
            class="md:hidden"
            [expanded]="showAllThumbs()"
            (toggled)="showAllThumbs.set(!showAllThumbs())"
          />
        }
      }
    </div>
  `,
})
export class ProductGallery {
  protected readonly text = inject(STOREFRONT_TEXT).catalog;

  /**
   * 25rem from `md` up, however many pictures. `md:w-100` without `shrink-0`:
   * held to it, a tight column pushed the thumbnail strip, the item that gives
   * way in a reversed row, off the left edge.
   */
  protected readonly mainImage = computed(
    () =>
      `aspect-square w-full min-w-0 touch-pan-y overflow-hidden rounded-lg
       bg-white ${this.compact() ? '' : 'md:w-100'}`,
  );

  protected readonly THUMBS_COLLAPSED = THUMBS_COLLAPSED;

  /** Only matters below `md`, where the toggle shows. */
  protected readonly showAllThumbs = signal(false);
  /** Only while a column of them fits the photo's height. */
  protected readonly beside = computed(() => {
    if (this.compact()) return false;
    const count = this.images().length;
    return count > 1 && count <= THUMBS_BESIDE;
  });

  /** Six no longer fit at 4rem, so they share the photo's height. */
  protected readonly shared = computed(
    () => this.images().length === THUMBS_BESIDE,
  );

  /** As wide as what is in it, so it sits at its column's left edge. Beside,
   * reversed: the strip shows left while the photo comes first in the
   * document. */
  protected readonly frameClass = computed(() => {
    const base = 'flex min-w-0 flex-col gap-3';
    if (this.compact()) return base;
    return this.beside()
      ? `${base} md:max-w-120 md:flex-row-reverse md:items-start md:gap-4`
      : `${base} md:max-w-100`;
  });

  /** A thumb past the first row, while a phone shows only that row. */
  protected folded(index: number): boolean {
    return (
      index >= THUMBS_COLLAPSED && !this.compact() && !this.showAllThumbs()
    );
  }

  protected readonly thumbsClass = computed(() => {
    if (this.compact()) return 'grid grid-cols-5 gap-2';
    // Under the photo, six to a row at the width the photo gives them; beside
    // it, one column of 4rem squares.
    const beside = this.shared()
      ? // The photo's 25rem less the five gutters between six squares.
        `grid grid-cols-5 gap-2
         md:w-[calc((25rem-5*0.75rem)/6)] md:shrink-0 md:grid-cols-1 md:gap-3`
      : 'grid grid-cols-5 gap-2 md:w-16 md:shrink-0 md:grid-cols-1 md:gap-3';
    return this.beside()
      ? beside
      : 'grid grid-cols-5 gap-2 md:grid-cols-6 md:gap-3';
  });

  readonly images = input.required<readonly ProductImage[]>();
  /** The main image's alt text. */
  readonly productName = input<string>('');
  readonly compact = input(false);

  /** Whoever chose it: a thumbnail, a swipe, or `show`. */
  readonly selectedChange = output<number>();

  /** Back to the first with every new set of images. */
  protected readonly selected = linkedSignal<readonly ProductImage[], number>({
    source: this.images,
    computation: () => 0,
  });

  /** For the variant list. */
  show(index: number): void {
    if (index < 0 || index >= this.images().length) return;
    this.select(index);
    if (index >= THUMBS_COLLAPSED) this.showAllThumbs.set(true);
  }

  protected select(index: number): void {
    if (index === this.selected()) return;
    this.selected.set(index);
    this.selectedChange.emit(index);
  }

  /** The product, and the variant where the picture shows one. */
  protected altFor(image: ProductImage): string {
    return image.variant
      ? `${this.productName()} — ${image.variant}`
      : this.productName();
  }

  protected readonly current = computed(() => {
    const imgs = this.images();
    return imgs[this.selected()] ?? imgs[0];
  });

  /** By URL, so it survives a change of selection. */
  protected readonly failed = signal(new Set<string>());

  protected markFailed(src: string): void {
    this.failed.update((set) => new Set(set).add(src));
  }

  protected thumbLabel(index: number): string {
    return fillText(this.text.viewImageAria, { n: index + 1 });
  }

  private touchStartX = 0;

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = touchX(event);
  }

  /** Clamped, not wrapped, as the strip counts the photos. */
  protected onTouchEnd(event: TouchEvent): void {
    const step = swipeStep(this.touchStartX, touchX(event));
    if (step === 0 || this.images().length < 2) return;
    const next = Math.max(
      0,
      Math.min(this.selected() + step, this.images().length - 1),
    );
    this.select(next);
    // Reaching a folded photo opens the rest, so the strip marks it.
    if (next >= THUMBS_COLLAPSED) this.showAllThumbs.set(true);
  }
}
