import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { FRAME, FRAME_SELECTED } from '../ui/frame';
import { ImagePlaceholder } from './image-placeholder';

/** Thumbnails kept on screen before the show-more toggle reveals the rest —
 * one row of the narrow grid, which is the width the cap is there for. Which
 * row that is has to be written into the class as a literal (`n+6`), so the
 * two move together: five columns, five kept, hide from the sixth. */
const THUMBS_COLLAPSED = 5;

/**
 * The product-page image viewer (FR-CAT-05): one large image with a grid of
 * thumbnails under it to switch between them. Under it at every width — the
 * gallery now shares its row with two other columns, and a strip beside the
 * image would take its width from the one thing on the page that has to stay
 * large. Selecting a thumbnail (click or hover) swaps the main image; there is
 * no auto-advance here — that belongs to the compact list-tile gallery.
 *
 * The thumbnails wrap into rows and take their size from the column they sit
 * in, rather than scrolling sideways at a fixed 4rem: a strip that scrolls
 * hides images behind a gesture, and its intrinsic width was wide enough to
 * stretch the whole column — and with it the main image — past a phone screen.
 * Narrow, only the first row is kept, with a toggle for the rest.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [ImagePlaceholder, Button],
  template: `
    <div class="flex min-w-0 flex-col gap-3">
      <div data-main-image [class]="mainImage">
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
          <div class="flex justify-center sm:hidden">
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
  protected readonly mainImage = `aspect-square overflow-hidden rounded-xl bg-stone-100 ${FRAME}`;

  protected readonly THUMBS_COLLAPSED = THUMBS_COLLAPSED;

  /** Only ever true on a narrow screen: from `sm` up every row is on screen and
   * the toggle is hidden, so the extra class it would add is dropped there. */
  protected readonly showAllThumbs = signal(false);
  protected readonly thumbsClass = computed(() => {
    const base = 'grid grid-cols-5 gap-2 sm:grid-cols-6 sm:gap-3';
    return this.showAllThumbs()
      ? base
      : `${base} max-sm:[&>li:nth-child(n+6)]:hidden`;
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
}
