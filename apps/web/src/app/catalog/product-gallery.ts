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
import { ImagePlaceholder } from './image-placeholder';

/**
 * The product-page image viewer (FR-CAT-05): one large image with a strip of
 * thumbnails to switch between them. The strip sits to the left of the main
 * image on desktop and above it on a phone. Selecting a thumbnail (click or
 * hover) swaps the main image; there is no auto-advance here — that belongs to
 * the compact list-tile gallery.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [ImagePlaceholder],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row">
      @if (images().length > 1) {
        <ul
          class="order-2 flex gap-3 overflow-x-auto sm:order-1 sm:w-20 sm:flex-col sm:overflow-visible"
        >
          @for (img of images(); track $index) {
            <li class="shrink-0">
              <button
                type="button"
                class="block aspect-square w-16 overflow-hidden rounded-md border-2 transition-colors sm:w-full"
                [class.border-accent]="$index === selected()"
                [class.border-transparent]="$index !== selected()"
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
      }

      <div class="order-1 flex-1 sm:order-2">
        <div class="aspect-square overflow-hidden rounded-xl bg-stone-100">
          @if (current(); as img) {
            @if (failed().has(img.full)) {
              <app-image-placeholder [label]="productName()" />
            } @else {
              <img
                [src]="img.full"
                [alt]="productName()"
                class="h-full w-full object-cover"
                (error)="markFailed(img.full)"
              />
            }
          } @else {
            <app-image-placeholder [label]="productName()" />
          }
        </div>
      </div>
    </div>
  `,
})
export class ProductGallery {
  private readonly text = inject(APP_TEXT).catalog;

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

  protected thumbLabel(index: number): string {
    return this.text.viewImage.replace('{n}', String(index + 1));
  }
}
