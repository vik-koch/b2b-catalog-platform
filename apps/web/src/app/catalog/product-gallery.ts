import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { swipeStep, touchX } from './swipe';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { FRAME, FRAME_SELECTED } from '../ui/frame';
import { ImagePlaceholder } from './image-placeholder';

/** Thumbnails a phone keeps before the show-more toggle takes over — one row
 * of the narrow grid. Which row that is has to be written into the class as a
 * literal (`n+6`), so the two move together: five columns, five kept, hide
 * from the sixth. */
const THUMBS_COLLAPSED = 5;

/**
 * The most that stand beside the photo. Six, because six squares and their
 * five gutters divide the photo's height exactly — the sixth is paid for by
 * all of them shrinking a little rather than by the column outgrowing the
 * picture it belongs to.
 */
const THUMBS_BESIDE = 6;

/**
 * The product-page image viewer (FR-CAT-05): one large image with the other
 * images beside it to switch between. Selecting a thumbnail (click or hover)
 * swaps the main image; there is no auto-advance here — that belongs to the
 * compact list-tile gallery.
 *
 * From `md` up to six thumbnails stand in a strip to the left of the photo,
 * where they cost the page no height — a column of them is no taller than the
 * photo beside it. Left rather than right because the page's other column is
 * on the right: thumbnails on that side would stand between the photo and the
 * way to buy it, and the two smallest things on the page would be the two in
 * the middle.
 *
 * Past six they go under the photo instead, six to a row and every one of
 * them on screen, taking their size from the picture they belong to. A column
 * that outgrows the photo would decide the gallery's height, and a product
 * with a dozen photographs would be a page about its photographs.
 *
 * Narrower than `md` the photo is 15rem and there is no column to stand a
 * strip in, so the thumbnails are always a row under it — and there only the
 * first five are kept, with a toggle for the rest.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [ImagePlaceholder, Button],
  template: `
    <div [class]="frameClass()">
      <!-- A horizontal swipe steps between the photos, the gesture the card
           in the listing already answers to (see swipe.ts). There is nothing
           to suppress afterwards: unlike the tile, the photo here is not a
           link, so a swipe cannot navigate. touch-pan-y keeps the page
           scrolling under a vertical drag. -->
      <div
        data-main-image
        [class]="mainImage"
        (touchstart)="onTouchStart($event)"
        (touchend)="onTouchEnd($event)"
      >
        @if (current(); as img) {
          @if (failed().has(img.full)) {
            <app-image-placeholder [label]="productName()" />
          } @else {
            <!-- The page's largest element, and server-rendered: telling the
                   browser so lets it start the fetch ahead of the other
                   in-body images instead of at their priority. -->
            <img
              [src]="img.full"
              [alt]="productName()"
              class="h-full w-full object-cover"
              fetchpriority="high"
              (error)="markFailed(img.full)"
            />
          }
        } @else {
          <app-image-placeholder [label]="productName()" />
        }
      </div>

      @if (images().length > 1) {
        <ul [class]="thumbsClass()">
          @for (img of images(); track $index) {
            <li>
              <button
                type="button"
                [class]="thumb($index === selected())"
                [attr.aria-current]="$index === selected() || null"
                [attr.aria-label]="thumbLabel($index)"
                (click)="selected.set($index)"
                (mouseenter)="selected.set($index)"
              >
                @if (failed().has(img.thumb)) {
                  <app-image-placeholder />
                } @else {
                  <img
                    [src]="img.thumb"
                    alt=""
                    class="h-full w-full object-cover"
                    loading="lazy"
                    (error)="markFailed(img.thumb)"
                  />
                }
              </button>
            </li>
          }
        </ul>
        @if (images().length > THUMBS_COLLAPSED) {
          <div class="flex justify-center md:hidden">
            <button
              type="button"
              appButton
              variant="ghost"
              size="sm"
              [attr.aria-expanded]="showAllThumbs()"
              (click)="showAllThumbs.set(!showAllThumbs())"
            >
              {{ showAllThumbs() ? text.showLess : text.showMore }}
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class ProductGallery {
  protected readonly text = inject(APP_TEXT).catalog;

  /** Framed like a photo in a listing: the same hairline, at the radius the
   * page's largest image is given. */
  /** 25rem from `md` up whatever else is in the frame: a product with one
   * image and a product with twelve show it at the same size. Uncapped below
   * that — on a phone the photo is the page, and a column narrower than the
   * cap is doing the capping anyway. */
  protected readonly mainImage = `aspect-square w-full min-w-0 touch-pan-y overflow-hidden rounded-xl bg-stone-100 md:w-100 md:shrink-0 ${FRAME}`;

  protected readonly THUMBS_COLLAPSED = THUMBS_COLLAPSED;

  /** Only ever true below `md`: from there the thumbnails stand in a column of
   * their own, every one of them on screen, and the toggle is hidden — so the
   * extra class it would add is dropped there. */
  protected readonly showAllThumbs = signal(false);
  /** Whether the thumbnails stand beside the photo. Only while a column of
   * them fits in the photo's own height: past that the strip would decide the
   * gallery's height, and a taller stack of small squares next to a picture
   * reads as the squares being the point. */
  protected readonly beside = computed(() => {
    const count = this.images().length;
    return count > 1 && count <= THUMBS_BESIDE;
  });

  /** The sixth thumbnail is the one that no longer fits at 4rem, so the six of
   * them share the photo's height instead — a little under 3.6rem each. */
  protected readonly shared = computed(
    () => this.images().length === THUMBS_BESIDE,
  );

  /**
   * The photo and its thumbnails. Beside, the frame is 30rem — the photo's
   * 25rem, the strip's 4rem and the gutter between them — and reversed, so the
   * strip is on the left while the photo stays the first thing in the
   * document. Underneath, the frame is the photo's own 25rem and the row of
   * thumbnails is as wide as the picture it belongs to.
   *
   * Either way the frame is exactly as wide as what is in it, so the gallery
   * sits at the left edge of its column rather than floating in the middle of
   * it.
   */
  protected readonly frameClass = computed(() => {
    const base = 'flex min-w-0 flex-col gap-3';
    return this.beside()
      ? `${base} md:max-w-120 md:flex-row-reverse md:items-start md:gap-4`
      : `${base} md:max-w-100`;
  });

  protected readonly thumbsClass = computed(() => {
    // Under the photo, six to a row at the width the photo gives them; beside
    // it, one column of 4rem squares.
    const beside = this.shared()
      ? // The photo's 25rem less the five gutters between six squares.
        'grid grid-cols-5 gap-2 md:w-[calc((25rem-5*0.75rem)/6)] md:shrink-0 md:grid-cols-1 md:gap-3'
      : 'grid grid-cols-5 gap-2 md:w-16 md:shrink-0 md:grid-cols-1 md:gap-3';
    const base = this.beside()
      ? beside
      : 'grid grid-cols-5 gap-2 md:grid-cols-6 md:gap-3';
    return this.showAllThumbs()
      ? base
      : `${base} [&>li:nth-child(n+6)]:max-md:hidden`;
  });

  images = input.required<readonly CatalogImage[]>();
  /** Product name, used as the main image's alt text. */
  productName = input<string>('');

  /** Resets to the first image whenever the product (its images) changes. */
  protected selected = linkedSignal<readonly CatalogImage[], number>({
    source: this.images,
    computation: () => 0,
  });

  protected current = computed(() => {
    const imgs = this.images();
    return imgs[this.selected()] ?? imgs[0];
  });

  /** Media URLs that failed to load — shown as the placeholder instead of the
   * browser's broken-image icon. Keyed by URL so it survives selection changes. */
  protected readonly failed = signal(new Set<string>());

  protected markFailed(src: string): void {
    this.failed.update((set) => new Set(set).add(src));
  }

  /** Every thumbnail carries the hairline the photos elsewhere have; the
   * chosen one wears it at accent, two pixels wide. Weight rather than colour
   * alone, so which one is chosen survives a page of photos that are already
   * the accent's colour — and outwards, so the photo inside is the same size
   * whichever one is chosen. */
  protected thumb(selected: boolean): string {
    return `block aspect-square w-full overflow-hidden rounded-md transition-shadow ${
      selected ? FRAME_SELECTED : FRAME
    }`;
  }

  protected thumbLabel(index: number): string {
    return this.text.viewImage.replace('{n}', String(index + 1));
  }

  private touchStartX = 0;

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = touchX(event);
  }

  /** Clamped rather than wrapped: the same step the thumbnails take, and the
   * strip below says which photo of how many this is — a swipe that jumped
   * from the last back to the first would contradict it. */
  protected onTouchEnd(event: TouchEvent): void {
    const step = swipeStep(this.touchStartX, touchX(event));
    if (step === 0 || this.images().length < 2) return;
    const next = Math.max(
      0,
      Math.min(this.selected() + step, this.images().length - 1),
    );
    this.selected.set(next);
    // A swipe can reach a photo the collapsed strip is not showing, and a
    // strip that does not mark the photo on screen is worse than a longer
    // one. Reaching it opens the rest for good: the visitor is past the
    // fifth picture, which is the answer the show-more was asking for.
    if (next >= THUMBS_COLLAPSED) this.showAllThumbs.set(true);
  }
}
