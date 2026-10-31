import {
  Component,
  computed,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import {
  ProductImage,
  ProductVariant,
} from '@b2b-catalog-platform/shared/core/catalog';
import { ProductGallery } from './product-gallery';
import { ProductVariantList } from './product-variant-list';

/**
 * How the list stands to the pictures: `page` under the product page's gallery,
 * `stack` under a compact one — a phone's dialog — and `side` beside a compact
 * one, where a bubble has the width and not the height.
 */
export type VariantGalleryShape = 'page' | 'stack' | 'side';

/**
 * A product's pictures with its variants beside them (FR-CAT-11, FR-CAT-13).
 * The gallery sizes the list: under it the list offers no width
 * (`contain-inline-size`), so long names wrap; beside it it is as tall as the
 * pictures and scrolls, so many names cannot carry a bubble off screen.
 */
@Component({
  selector: 'app-product-variant-gallery',
  imports: [ProductGallery, ProductVariantList],
  host: { '[class]': 'hostClass()' },
  template: `
    <app-product-gallery
      [class]="shape() === 'side' ? 'block w-60 shrink-0' : ''"
      [images]="images()"
      [productName]="productName()"
      [compact]="shape() !== 'page'"
      (selectedChange)="shown.set($event)"
    />
    @if (variants().length) {
      <div [class]="listBoxClass() + ' ' + listWhere()">
        <app-product-variant-list
          [class]="listClass()"
          [variants]="variants()"
          [images]="images()"
          [current]="current()"
          (pick)="show($event)"
        />
      </div>
    }
  `,
})
export class ProductVariantGallery {
  readonly images = input.required<readonly ProductImage[]>();
  readonly variants = input.required<readonly ProductVariant[]>();
  readonly productName = input('');
  readonly shape = input<VariantGalleryShape>('page');
  /** Where this list shows: the page draws its own in the middle column, from
   * `current` and `show`, and this one only once that column has gone. */

  readonly listWhere = input('');

  protected readonly hostClass = computed(() =>
    this.shape() === 'side'
      ? 'flex min-w-0 items-stretch gap-4'
      : 'flex min-w-0 flex-col gap-4',
  );

  /** Beside the pictures, a box exactly their height that the list is laid
   * into, so its length can never set the row's. */
  protected readonly listBoxClass = computed(() =>
    this.shape() === 'side'
      ? 'relative min-w-0 flex-1'
      : 'min-w-0 contain-inline-size',
  );

  protected readonly listClass = computed(() =>
    this.shape() === 'side'
      ? 'absolute inset-0 block overflow-y-auto px-1'
      : 'block',
  );

  private readonly gallery = viewChild.required(ProductGallery);

  /** Follows the gallery, which starts every product at its first picture. */
  protected readonly shown = linkedSignal<readonly ProductImage[], number>({
    source: this.images,
    computation: () => 0,
  });

  readonly current = computed(
    () => this.images()[this.shown()]?.variant ?? null,
  );

  show(index: number): void {
    this.gallery().show(index);
  }
}
