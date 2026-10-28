import { Component, inject, input } from '@angular/core';
import { ProductFeature } from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { fileTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/file-text';
import { layers2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/layers-2';
import { messageCircleIcon } from '@b2b-catalog-platform/ui/icons/glyphs/message-circle';
import { packagePlusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/package-plus';
import { paletteIcon } from '@b2b-catalog-platform/ui/icons/glyphs/palette';
import { starIcon } from '@b2b-catalog-platform/ui/icons/glyphs/star';

/**
 * One glyph per thing a product can carry (FR-ADM-20), shared by the grid row,
 * the grid's filter chips and the editor's section headings, so each is learnt
 * once. Variants, sets and pairings are the storefront's own glyphs.
 */
export const PRODUCT_FEATURE_GLYPHS: Record<ProductFeature, Glyph> = {
  featured: starIcon,
  variants: paletteIcon,
  note: messageCircleIcon,
  set: layers2Icon,
  pairings: packagePlusIcon,
  documents: fileTextIcon,
};

/**
 * The glyphs of what a product carries, in a row. Each is named by its tooltip
 * and, for a screen reader, in words, because a phone has no hover and a glyph
 * is not a name.
 */
@Component({
  selector: 'app-product-feature-glyphs',
  imports: [Icon],
  template: `
    @if (features().length) {
      <ul class="flex items-center gap-1.5 text-ink-subtle">
        @for (feature of features(); track feature) {
          <li class="flex" [title]="text[feature]">
            <ui-icon [glyph]="glyphs[feature]" class="size-3.5" />
            <span class="sr-only">{{ text[feature] }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ProductFeatureGlyphs {
  protected readonly text = inject(ADMIN_TEXT).products.list.has;
  protected readonly glyphs = PRODUCT_FEATURE_GLYPHS;

  readonly features = input.required<readonly ProductFeature[]>();
}
