import {
  Component,
  computed,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { ProductImage, ProductVariant } from '@b2b-catalog-platform/shared';
import { ProductGallery } from './product-gallery';
import { ProductVariantList } from './product-variant-list';

/**
 * How the list stands to the pictures: `page` under the product page's gallery,
 * `stack` under a compact one — a phone's dialog — and `side` beside a compact
 * one, where a bubble has the width and not the height.
 */
export type VariantGalleryShape = 'page' | 'stack' | 'side';

/**
 * A product's pictures with its variants listed next to them (FR-CAT-11) — the
 * product page's gallery, and what a row's variants mark opens (FR-CAT-13).
 * Never over a picture. A product that names no variants is its gallery alone.
 *
 * The list is sized by the gallery rather than the other way round: under it,
 * it has no width of its own to offer the column (`contain-inline-size`), so a
 * run of long names wraps instead of widening the page; beside it, it is as
 * tall as the pictures and scrolls past that, so fifteen names do not carry a
 * bubble off the bottom of the screen.
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
  /**
   * Classes that say where its own list is drawn. The product page shows the
   * list in its middle column where it has one, and here only once that
   * column has gone — the page draws the second list itself, from `current`
   * and `show`.
   */
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
