import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { useProductUnits } from './product-units-view';
import { TileGallery } from './tile-gallery';

/**
 * One product card in a grid (FR-CAT-04) — gallery, name, price — shared by the
 * category grid and the search results so the two cannot drift apart.
 *
 * Edit-mode controls are projected rather than built in: only the category grid
 * has them, and they are absolutely positioned inside this card's own stacking
 * context, which is why the card owns `relative` and the slot sits at its top.
 */
@Component({
  selector: 'app-product-tile',
  imports: [RouterLink, TileGallery],
  host: { class: 'h-full' },
  template: `
    <div
      class="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white transition-shadow hover:shadow-md"
    >
      <ng-content />
      <app-tile-gallery
        [images]="item().images"
        [link]="['/product', item().slug]"
        [productName]="item().name"
      />
      <div class="flex flex-col p-3">
        <a [routerLink]="['/product', item().slug]" class="block">
          <h2
            class="line-clamp-2 text-sm text-stone-700 group-hover:text-accent"
            [title]="item().name"
          >
            {{ item().name }}
          </h2>
        </a>
        <!-- Price anchored to the card bottom so it lines up across tiles
             regardless of name length; future stock / add-to-cart sit beneath.
             Only the per-piece price is prominent; the other units, the minimum
             and the packaging each get their own line so a card stays scannable. -->
        <div class="mt-auto pt-2">
          <p class="font-bold text-primary">
            {{ piecePrice() }}
            <span class="text-xs font-normal text-subtle">{{
              pieceLabel()
            }}</span>
          </p>
          @if (unitPrices().length) {
            <!-- One line, both ends: with two prices they sit apart, and with
                 one it simply starts at the left. The amount never shrinks —
                 only its label ellipsizes when the card is narrow. -->
            <p
              class="my-0.5 flex items-baseline justify-between gap-2 text-xs leading-snug text-subtle"
            >
              @for (row of unitPrices(); track row.label) {
                <span class="flex min-w-0 items-baseline gap-1">
                  <span class="shrink-0 font-medium text-secondary">{{
                    row.price
                  }}</span>
                  <span class="truncate">{{ row.label }}</span>
                </span>
              }
            </p>
          }
          @if (minimum(); as detail) {
            <p class="text-xs leading-snug text-subtle">
              {{ minLabel }} {{ detail }}
            </p>
          }
          @if (packaging(); as summary) {
            <p class="text-xs leading-snug text-subtle">
              {{ packagingLabel }} {{ summary }}
            </p>
          }
        </div>
      </div>
    </div>
  `,
})
export class ProductTile {
  readonly item = input.required<ProductListItem>();

  private readonly units = useProductUnits();

  private readonly rows = computed(() =>
    this.units.priceRows(this.item().prices),
  );

  protected readonly piecePrice = computed(() => this.rows()[0].price);
  protected readonly pieceLabel = computed(() => this.rows()[0].label);

  /** Pack and box, if the product is sold that way. */
  protected readonly unitPrices = computed(() => this.rows().slice(1));

  protected readonly minimum = computed(() =>
    this.units.packagedMinimum(this.item().packaging),
  );

  protected readonly packaging = computed(() =>
    this.units.packagingSummary(this.item().packaging),
  );

  private readonly text = inject(APP_TEXT).catalog.units;
  protected readonly minLabel = `${this.text.minQuantity}:`;
  protected readonly packagingLabel = `${this.text.packaging}:`;
}
