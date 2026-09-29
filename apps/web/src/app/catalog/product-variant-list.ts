import { Component, inject, input, output } from '@angular/core';
import { ProductImage, ProductVariant } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';

/** Where a variant's first picture is in the gallery, or -1 where it has none
 * on show — none uploaded yet, or withheld while it is unavailable. */
export function firstPictureOf(
  images: readonly ProductImage[],
  variant: string,
): number {
  return images.findIndex((image) => image.variant === variant);
}

/**
 * The variants a product names, as a list beside its pictures (FR-CAT-11):
 * every name in full, wrapping rather than shortening, and the variant of the
 * picture on show marked, however that picture came to be shown.
 *
 * Pointing at a name, focusing it or tapping it asks for its first picture,
 * and nothing puts the gallery back afterwards: a list that snapped back as
 * the pointer left it would flicker under a hand crossing it on the way to the
 * button. A variant with no picture on show is listed but asks for nothing,
 * and an unavailable one says so (FR-CAT-12).
 */
@Component({
  selector: 'app-product-variant-list',
  template: `
    <h2
      [id]="headingId"
      class="mb-3 font-medium text-subtle text-xs tracking-wide uppercase"
    >
      {{ text.heading }}
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
              <span [class.text-subtle]="variant.unavailable">{{
                variant.name
              }}</span>
              @if (variant.unavailable) {
                <span class="text-xs text-subtle">
                  · {{ text.unavailable }}</span
                >
              }
            </span>
          }
        </li>
      }
    </ul>
  `,
})
export class ProductVariantList {
  protected readonly text = inject(APP_TEXT).catalog.variants;

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

  private readonly base =
    'inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-sm leading-tight';

  /** A hairline either way, answering a pointer with accent. The chosen one
   * is told apart by colour and a tint rather than weight: a row of these is
   * read beside a gallery whose own chosen thumbnail already wears the heavy
   * frame, and two of them would compete for the eye. */
  protected chip(chosen: boolean): string {
    return `${this.base} text-left ring-1 transition-colors hover:text-accent hover:ring-accent ${
      chosen
        ? 'bg-primary/8 ring-primary animate-variant-chosen motion-reduce:animate-none'
        : 'bg-white ring-border-strong'
    }`;
  }

  /** A variant with no picture yet: offered like the others, so drawn like
   * them at rest, but with nothing to answer a pointer with. */
  protected readonly pictureless = `${this.base} bg-white ring-1 ring-border`;

  /** One that is out for now: greyed on the page's ground, which is what says
   * it cannot be had rather than that it has no picture. */
  protected readonly unavailable = `${this.base} bg-ink/5 text-muted`;
}
