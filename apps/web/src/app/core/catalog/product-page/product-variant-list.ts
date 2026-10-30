import { Component, inject, input, output } from '@angular/core';
import {
  ProductImage,
  ProductVariant,
} from '@b2b-catalog-platform/shared/core/catalog';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';

/** Where a variant's first picture is in the gallery, or -1 where it has none
 * on show — none uploaded yet, or withheld while it is unavailable. */
export function firstPictureOf(
  images: readonly ProductImage[],
  variant: string,
): number {
  return images.findIndex((image) => image.variant === variant);
}

/**
 * A product's variants beside its pictures (FR-CAT-11), names in full and the
 * one on show marked. Pointing, focus or a tap asks for its first picture, and
 * nothing snaps back on leaving: it would flicker under a hand crossing to the
 * button. Unavailable ones say so (FR-CAT-12).
 */
@Component({
  selector: 'app-product-variant-list',
  template: `
    <h2
      [id]="headingId"
      class="mb-3 font-medium text-ink-subtle text-xs tracking-wide uppercase"
    >
      {{ product.variants }}
    </h2>
    <ul class="flex flex-wrap gap-1.5" [attr.aria-labelledby]="headingId">
      @for (variant of variants(); track variant.name) {
        <li class="flex min-w-0">
          @if (firstPicture(variant.name) >= 0) {
            <button
              type="button"
              [class]="chip(variant.name === current())"
              [attr.aria-pressed]="variant.name === current()"
              (mouseenter)="ask(variant.name)"
              (focus)="ask(variant.name)"
              (click)="ask(variant.name)"
            >
              {{ variant.name }}
            </button>
          } @else {
            <span [class]="variant.unavailable ? unavailable : pictureless">
              <span [class.text-ink-subtle]="variant.unavailable">{{
                variant.name
              }}</span>
              @if (variant.unavailable) {
                <span class="text-xs text-ink-subtle">
                  · {{ text.unavailable }}</span
                >
              }
            </span>
          }
        </li>
      }
    </ul>
    <p class="mt-2 text-xs text-ink-subtle">{{ text.note }}</p>
  `,
})
export class ProductVariantList {
  protected readonly text = inject(STOREFRONT_TEXT).catalog.variants;
  protected readonly product = inject(SHARED_TEXT).product;

  readonly variants = input.required<readonly ProductVariant[]>();
  /** The pictures on show, in gallery order. */
  readonly images = input.required<readonly ProductImage[]>();
  /** The variant of the picture on show; null for a picture of the range. */
  readonly current = input<string | null>(null);

  /** The index of the picture asked for. */
  readonly pick = output<number>();

  private static nextId = 0;
  protected readonly headingId = `variant-heading-${ProductVariantList.nextId++}`;

  protected firstPicture(variant: string): number {
    return firstPictureOf(this.images(), variant);
  }

  protected ask(variant: string): void {
    const index = this.firstPicture(variant);
    if (index >= 0) this.pick.emit(index);
  }

  private readonly base = `inline-flex min-w-0 items-center gap-1 rounded-md
                           px-2 py-1 text-sm leading-tight`;

  /** The chosen one in the secondary colour, the pictures' labels' own. */
  protected chip(chosen: boolean): string {
    return `${this.base} text-left ring-1 transition-colors ${
      chosen
        ? `bg-secondary text-white ring-secondary animate-variant-chosen
           motion-reduce:animate-none`
        : 'bg-white ring-edge-strong hover:text-accent hover:ring-accent'
    }`;
  }

  /** No picture yet: drawn like the others at rest, answering no pointer. */
  protected readonly pictureless = `${this.base} bg-white ring-1 ring-edge`;

  /** Greyed: it cannot be had, which is more than having no picture. */

  protected readonly unavailable = `${this.base} bg-ink/5 text-ink-subtle`;
}
