import { Component, computed, inject, input } from '@angular/core';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { imageOffIcon } from '@b2b-catalog-platform/ui/icons/glyphs/image-off';
import { STOREFRONT_TEXT } from '../config/storefront-text';

/**
 * What stands in for a product photo that is not there. Fills its box, from a
 * thumbnail to the product page's image; the caption shows from the width
 * that holds it, measured on the box rather than the window.
 */
@Component({
  selector: 'app-image-placeholder',
  imports: [Icon],
  host: {
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
    class: `@container/placeholder flex h-full w-full flex-col items-center
            justify-center gap-2 bg-surface text-ink-subtle`,
  },
  template: `
    <app-icon
      [glyph]="imageOffIcon"
      class="size-8 [--icon-stroke-width:1.5]"
      aria-hidden="true"
    />
    <!-- 6rem holds the glyph, the gap and two wrapped lines of caption in a
         box as tall as it is wide. Below that it is a thumbnail, and the
         glyph says the same thing on its own. -->
    <span
      class="hidden px-2 text-center text-xs text-balance
             @min-[6rem]/placeholder:block"
      >{{ text.imagePlaceholder }}</span
    >
  `,
})
export class ImagePlaceholder {
  protected readonly imageOffIcon = imageOffIcon;
  protected readonly text = inject(STOREFRONT_TEXT).catalog;

  /** The product's name, as a real image's alt would carry it. */
  label = input<string>('');

  protected ariaLabel = computed(() => {
    const name = this.label();
    return name
      ? `${name} — ${this.text.imagePlaceholder}`
      : this.text.imagePlaceholder;
  });
}
